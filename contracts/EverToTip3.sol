pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/EverToTip3Gas.sol";
import "./libraries/SwapEverErrors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./interfaces/IEverVault.sol";
import "./interfaces/IEverTip3SwapEvents.sol";
import "./interfaces/IEverTip3SwapCallbacks.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensMintCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensBurnCallback.sol";

contract EverToTip3 is IAcceptTokensMintCallback, IAcceptTokensTransferCallback, IAcceptTokensBurnCallback, IEverTip3SwapEvents {

    uint32 static randomNonce_;

    address wEverRoot_;
    address wEverWallet_;
    address wEverVault_;

    constructor(address _wEverRoot, address _wEverVault) public {
        tvm.accept();
        wEverRoot_ = _wEverRoot;
        wEverVault_ = _wEverVault;
    
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);
        ITokenRoot(wEverRoot_).deployWallet {
            value: EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: EverToTip3.onWEverWallet
        }(
            address(this), 
            EverToTip3Gas.DEPLOY_EMPTY_WALLET_GRAMS
        );

        msg.sender.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
    }

    // Callback deploy WEVER wallet for contract
    function onWEverWallet(address _wEverWallet) external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        wEverWallet_ = _wEverWallet;
        wEverWallet_.transfer(0, false, MsgFlag.REMAINING_GAS + MsgFlag.IGNORE_ERRORS);
    }

    // Payload constructor swap Ever -> Tip-3
    function buildExchangePayload(
        uint64 id, 
        uint128 amount, 
        address pair,
        uint128 expectedAmount,
        uint128 deployWalletValue
    ) external pure returns (TvmCell) {
        TvmBuilder builderPayload;
        builderPayload.store(id);
        builderPayload.store(amount);
        builderPayload.store(pair);
        builderPayload.store(expectedAmount);
        builderPayload.store(deployWalletValue);
        return builderPayload.toCell();
    }

    // swapEvers - wrap EVER to WEVER.
    function swapEvers(address user, TvmCell payload) external {
        TvmSlice payloadSlice = payload.toSlice();
        
        require(payloadSlice.bits() == 715, SwapEverErrors.INVALID_CALLBACK);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);

        (uint64 id, uint128 amount) = payloadSlice.decode(uint64, uint128);

        if (msg.value >= (amount + EverToTip3Gas.SWAP_EVER_TO_TIP3_MIN_VALUE)) {
            IEverVault(wEverVault_).wrap{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                address(this), 
                user, 
                payload
            );
        } else {
            TvmBuilder payloadID_;
            payloadID_.store(id);
            
            IEverTip3SwapCallbacks(user).onSwapEverToTip3Cancel{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(id);            
        }
    }

    // Callback Mint token to wEwerWallet contract
    function onAcceptTokensMint(
        address /*tokenRoot*/,
        uint128 amount,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == wEverWallet_, SwapEverErrors.NOT_WALLET_WEVER);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);
       
        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 715 && msg.value >= (EverToTip3Gas.SWAP_EVER_TO_TIP3_MIN_VALUE)) {
            (uint64 id, uint128 amount_, address pair, uint128 expectedAmount, uint128 deployWalletValue) =
            payloadSlice.decode(uint64, uint128, address, uint128, uint128);
            
            emit SwapEverToTip3WEverMint(id, amount_, pair, expectedAmount, deployWalletValue);

            TvmBuilder successPayload;
            successPayload.store(EverToTip3OperationStatus.SUCCESS);
            successPayload.store(id);
            successPayload.store(deployWalletValue);

            TvmBuilder cancelPayload;
            cancelPayload.store(EverToTip3OperationStatus.CANCEL);
            cancelPayload.store(id);
            
            TvmBuilder resultPayload;

            resultPayload.store(DexOperationTypes.EXCHANGE);
            resultPayload.store(id);
            resultPayload.store(deployWalletValue);
            resultPayload.store(expectedAmount);

            resultPayload.storeRef(successPayload);
            resultPayload.storeRef(cancelPayload);

            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                pair,
                uint128(0),
                user,
                true,
                resultPayload.toCell()
            );
        } else {
                uint64 id = 0;
                if (payloadSlice.bits() >= 64) {
                    id = payloadSlice.decode(uint64);
                }

                TvmBuilder payloadID_;
                payloadID_.store(id);

                // Burn WEVER
                ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                    amount,
                    wEverVault_,
                    uint128(0),
                    user,
                    true,
                    payloadID_.toCell()
                );
        }
    }

    //Callback result swap
    function onAcceptTokensTransfer(
        address /*tokenRoot*/,
        uint128 amount,
        address sender,
        address /*senderWallet*/,
        address user,
        TvmCell payload
    ) override external {
        TvmSlice payloadSlice = payload.toSlice();
        bool needCancel;
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);

        if (payloadSlice.bits() >= 8) {
            uint8 operationStatus = payloadSlice.decode(uint8);
            if (payloadSlice.bits() == 64 && operationStatus == EverToTip3OperationStatus.CANCEL && 
                msg.sender.value != 0 && msg.sender == wEverWallet_)
            {
                (uint64 id) = payloadSlice.decode(uint64);
                
                TvmBuilder payloadID_;
                payloadID_.store(id);

                // Burn WEVER
                ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                    amount,
                    wEverVault_,
                    uint128(0),
                    user,
                    true,
                    payloadID_.toCell()
                );
            } else if (payloadSlice.bits() == 192 && operationStatus == EverToTip3OperationStatus.SUCCESS) {
                (uint64 id, uint128 deployWalletValue_) = payloadSlice.decode(uint64, uint128);

                IEverTip3SwapCallbacks(user).onSwapEverToTip3Success{ value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: false }(id, amount);
                
                emit SwapEverToTip3SuccessTransfer(user, id);

                TvmBuilder payloadID_;
                payloadID_.store(id);

                // Send TIP-3 token user
                ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                    amount,
                    user,
                    deployWalletValue_,
                    user,
                    true,
                    payloadID_.toCell()
                    );  
            } else {
                needCancel = true;    
            }  
        } else {
            needCancel = true;
        }

        if (needCancel) {
            TvmCell emptyPayload;
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                sender,
                uint128(0),
                user,
                true,
                emptyPayload                        
            );
        }
    }
    
    // Callback Burn token if result swap cancel
    function onAcceptTokensBurn(
        uint128 /*amount*/,
        address /*walletOwner*/,
        address /*wallet*/,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0); 
      
        TvmSlice payloadSlice =  payload.toSlice();
        (uint64 id) = payloadSlice.decode(uint64);

        emit SwapEverToTip3CancelTransfer(user, id);
        IEverTip3SwapCallbacks(user).onSwapEverToTip3Cancel{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(id);
    }
}