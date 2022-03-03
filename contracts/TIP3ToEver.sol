pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/DexGas.sol";
import "./libraries/SwapEverErrors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./interfaces/IEverTIP3SwapEvents.sol";
import "./interfaces/IEverTIP3SwapCallbacks.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract TIP3ToEver is IAcceptTokensTransferCallback, IEverTIP3SwapEvents{
   
    uint32 static _nonce;
    
    address wEverRoot_;
    address wEverWallet_;
    address wEverVault_;
    address dexVault_;

    constructor(address _wEverRoot, address _wEverWallet, address _wEverVault, address _dexVault) public {
        tvm.accept();
        wEverRoot_ = _wEverRoot;
        wEverVault_ = _wEverVault;
        dexVault_ = dexVault_;

        tvm.rawReserve(1 ton, 0);
        ITokenRoot(wEverRoot_).deployWallet{
            value : DexGas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: TIP3ToEver.onWEverWallet    
        }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);
    }

    // Payload constructor swap TIP-3 -> Ever
    function buildSwapEversPayload(
        uint8 operationStatus,
        uint64 id, 
        address recipient,
        uint128 expectedAmount,
        uint64 user ) external pure returns (TvmCell) {
        TvmBuilder builderPayload;
        builderPayload.store(operationStatus);
        builderPayload.store(id);
        builderPayload.store(recipient);
        builderPayload.store(expectedAmount);
        builderPayload.store(user);
        return builderPayload.toCell();
    }

    // callback deploy WEVER wallet for contract
    function onWEverWallet(address _wEverWallet) external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        wEverWallet_ = _wEverWallet;
    }

    // Callback result swap
    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address senderWallet,
        address user,
        TvmCell payload
    ) override external {
        TvmSlice payloadSlice = payload.toSlice();

        if (payloadSlice.bits() == 734) {
            (uint8 OperationStatus, uint64 id, address recipient, uint128 expectedAmount, address user_) = payloadSlice.decode(uint8, uint64, address, uint128, address);
            
            require(OperationStatus == EverToTip3OperationStatus.SWAP, SwapEverErrors.UNKNOWN_OPERATION_STATUS);
            tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);
            
            TvmBuilder successPayload;
            successPayload.store(EverToTip3OperationStatus.SUCCESS);
            successPayload.store(user_);
            
            TvmBuilder cancelPayload;
            cancelPayload.store(EverToTip3OperationStatus.CANCEL);
            cancelPayload.store(id);
            cancelPayload.store(user_);

            TvmBuilder resultPayload;
            resultPayload.store(DexOperationTypes.EXCHANGE);
            resultPayload.store(id);
            resultPayload.store(uint128(0));
            resultPayload.store(uint128(0));
            resultPayload.store(expectedAmount);
            
            resultPayload.storeRef(successPayload);
            resultPayload.storeRef(cancelPayload);

            ITokenWallet(msg.sender).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                amount,
                recipient,
                uint128(0),
                user,
                true,
                resultPayload.toCell()
            );
        } else if (payloadSlice.bits() == 339) {
            tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);
            (uint8 dexOperationType_, uint64 id_, uint128 deployWalletValue_, uint128 amount_) = payloadSlice.decode(uint8, uint64, uint128, uint128);
            
            emit TIP3WEverCancel(user, id_);    

            TvmBuilder payloadID;
            payloadID.store(id_);
            TvmCell payloadID_ = payloadID.toCell();

            IEverTIP3SwapCallbacks(user).onCancel{value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: false}(id_);

            ITokenWallet(msg.sender).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                amount,
                user,
                uint128(0),
                user,
                true,
            payloadID_
            );
        } else if (payloadSlice.bits() == 476) {
            require(msg.sender.value != 0 && msg.sender == wEverWallet_, SwapEverErrors.NOT_WALLET_WEVER);
            tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);
            
            (uint8 dexOperationType_, uint64 id_, uint128 deployWalletValue_, uint128 amount_) = payloadSlice.decode(uint8, uint64, uint128, uint128);

            emit TIP3WEverSuccess(user, id_);

            TvmBuilder payloadID;
            payloadID.store(id_);
            TvmCell payloadID_ = payloadID.toCell();

            ITokenWallet(wEverWallet_).transfer(
            amount,
            wEverVault_,
            uint128(0),
            user,
            true,
            payloadID
            );   
        }
    }

     // Callback Burn token if result swap success
    function onAcceptTokensBurn(
        uint128 amount,
        address walletOwner,
        address wallet,
        address user,
        TvmCell payload
    ) override external {
       require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER); 
       TvmSlice payloadSlice =  payload.toSlice();
       (uint64 id_) = payloadSlice.decode(uint64);

       emit TIP3TokenSuccessBurn(user, id_);

       IEverTIP3SwapCallbacks(user).onSuccess{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(id_);
    }

}