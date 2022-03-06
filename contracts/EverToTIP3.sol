pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/EverToTip3Gas.sol";
import "./libraries/SwapEverErrors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./interfaces/IEverVault.sol";
import "./interfaces/IEverTIP3SwapEvents.sol";
import "./interfaces/IEverTIP3SwapCallbacks.sol";

 import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
 import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
 import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
 import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensMintCallback.sol";
 import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
 import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensBurnCallback.sol";

contract EvereToTip3 is IAcceptTokensMintCallback, IAcceptTokensTransferCallback, IAcceptTokensBurnCallback, IEverTIP3SwapEvents {

    uint32 static _nonce;

    address wEverRoot_;
    address wEverWallet_;
    address wEverVault_;

    constructor(address _wEverRoot, address _wEverVault) public {
        tvm.accept();
        wEverRoot_ = _wEverRoot;
        wEverVault_ = _wEverVault;
    
        tvm.rawReserve(EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE, 0);
        ITokenRoot(wEverRoot_).deployWallet {
            value: EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: EvereToTip3.onWEverWallet
        }(
            address(this), 
            EverToTip3Gas.DEPLOY_EMPTY_WALLET_GRAMS
        );
    }

    // Callback deploy WEVER wallet for contract
    function onWEverWallet(address _wEverWallet) external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        wEverWallet_ = _wEverWallet;
    }

    // Payload constructor swap Ever -> TIP-3
    function buildSwapEversPayload(
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
        
        (uint64 id, uint128 amount, address pair, uint128 expectedAmount, uint128 deployWalletValue) =
        payloadSlice.decode(uint64, uint128, address, uint128, uint128);

        require(msg.value >= (amount + EverToTip3Gas.GAS_SWAP), SwapEverErrors.VALUE_TOO_LOW); 

        emit WrapEverToWEver(user, id);
        IEverVault(wEverVault_).wrap(
            amount,
            address(this), 
            user, 
            payload
        ); 
    }

    // Callback Mint token to wEwerWallet contract
    function onAcceptTokensMint(
        address tokenRoot,
        uint128 amount,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == wEverWallet_, SwapEverErrors.NOT_WALLET_WEVER);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);
       
        TvmSlice  payloadSlice = payload.toSlice();
        (uint64 id, uint128 amount_, address pair, uint128 expectedAmount, uint128 deployWalletValue) =
        payloadSlice.decode(uint64, uint128, address, uint128, uint128);
        
        emit WEverTokenMint(user, id);

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);
        successPayload.store(user);
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(user);

        TvmBuilder resultPayload;

        resultPayload.store(DexOperationTypes.EXCHANGE);
        resultPayload.store(id);
        resultPayload.store(EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE);
        resultPayload.store(uint128(0));

        resultPayload.storeRef(successPayload);
        resultPayload.storeRef(cancelPayload);

        ITokenWallet(wEverWallet_).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
            amount,
            pair,
            deployWalletValue,
            user,
            true,
            resultPayload.toCell()
        );
    }

    //Callback result swap
    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address senderWallet,
        address user,
        TvmCell payload
    ) override external {
        TvmSlice payloadSlice = payload.toSlice();
        
        if (payloadSlice.bits() == 339 || payloadSlice.bits() == 476) {
            (uint8 dexOperationType_, uint64 id_, uint128 deployWalletValue_, uint128 amount_) =
                        payloadSlice.decode(uint8, uint64, uint128, uint128);
            
            require(dexOperationType_ == DexOperationTypes.EXCHANGE, SwapEverErrors.UNAVAILABLE_OPERATION_TYPE);
            tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);
           
            TvmBuilder payloadID;
            payloadID.store(id_);
            TvmCell payloadID_ = payloadID.toCell();

            if (payloadSlice.bits() == 339) {
                if (msg.sender.value != 0 && msg.sender == wEverWallet_) {
                        emit WEverTIP3Cancel(user, id_);
                        // Burn WEVER
                        ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: true }(
                            amount,
                            wEverVault_,
                            0,
                            user,
                            true,
                            payloadID_
                        );
                }
            } else if (payloadSlice.bits() == 476) {
                IEverTIP3SwapCallbacks(user).onSuccess{ value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: false }(id_, amount);
                
                TvmCell successPayload = payloadSlice.loadRef();
                TvmSlice successPayloadSlice = successPayload.toSlice();
                (uint8 operationStatus_, uint64 _id,  address user_, uint128 deployWalletValue) = 
                successPayloadSlice.decode(uint8, uint64, address, uint128);
                
                emit WEverTIP3Success(user, _id);

                // Send TIP-3 token user
                ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                    amount,
                    user,
                    deployWalletValue,
                    user,
                    true,
                    payloadID_
                    );  
            }  
        } else {
            TvmCell emptyPayload;
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: true }(
                amount,
                user,
                0,
                user,
                false,
                emptyPayload                        
            );
        }
    }
    
    // Callback Burn token if result swap cancel
    function onAcceptTokensBurn(
        uint128 amount,
        address walletOwner,
        address wallet,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0); 
      
        TvmSlice payloadSlice =  payload.toSlice();
        (uint64 id_) = payloadSlice.decode(uint64);

        emit WEverTokenCancelBurn(user, id_);
        IEverTIP3SwapCallbacks(user).onCancel{ value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: true }(id_);
    }
}