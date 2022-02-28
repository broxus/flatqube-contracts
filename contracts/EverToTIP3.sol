pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/DexGas.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./abstract/DexContractBase.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IEverValt.sol";
import "./interfaces/IEverTIP3SwapCallbacks.sol";

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensMintCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensBurnCallback.sol";


abstract contract EvereToTip3 is DexContractBase, IDexRoot, IEverValt, IAcceptTokensMintCallback, IAcceptTokensTransferCallback, IAcceptTokensBurnCallback, IEverTIP3SwapCallbacks {

    uint32 static _nonce;

    address owner_;
    address pendingOwner;

    address weverRoot_;
    address weverAddress_;
    address weverVault_;
    address dexVault_;

    constructor(address _owner, address _weverRoot, address _weverVault, address _dexVault) public {
        tvm.accept();
        owner_ = _owner;
        weverRoot_ = _weverRoot;
        weverVault_ = _weverVault;
        dexVault_ = _dexVault;

       ITokenRoot(weverRoot_)
       .deployWallet{
           value : DexGas.DEPLOY_EMPTY_WALLET_VALUE,
           flag: MsgFlag.SENDER_PAYS_FEES,
           callback: EvereToTip3.onTokenWallet
       }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);
    }

    modifier onlyOwner() {
        require(msg.sender.value != 0 && msg.sender == owner_, DexErrors.NOT_MY_OWNER);
        _;
    }

    // callback deploy wever for contract
    function onTokenWallet (address _weverAddress) external {
        require(msg.sender.value != 0 && msg.sender == weverRoot_, DexErrors.NOT_ROOT);
        weverAddress_ = _weverAddress;
    }

    function getOwner() external view responsible returns (address) {
        return {value: 0, flag: MsgFlag.REMAINING_GAS, bounce: false} owner_;
    }
    
    function getPendingOwner() external view responsible returns (address) {
        return {value: 0, flag: MsgFlag.REMAINING_GAS, bounce: false} pendingOwner;
    }

    function transferOwner(address newOwner) external onlyOwner {
         emit RequestedOwnerTransfer(owner_, newOwner);
         pendingOwner = newOwner;
    }

    function acceptOwner() external {
        require(msg.sender.value != 0 && msg.sender == pendingOwner, DexErrors.NOT_PENDING_OWNER);
        emit OwnerTransferAccepted(owner_, pendingOwner);
        owner_ = pendingOwner;
        pendingOwner = address.makeAddrStd(0, 0);
    }

    function swapEvers(TvmCell payload, address remainingGas) external {
        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 715) {
            (uint64 id, uint128 amount, address pairAddress, uint128 expectedAmount, uint128 deployWalletGas) =
            payloadSlice.decode(uint64, uint128, address, uint128, uint128);

            require(msg.value >= (amount+DexGas.VAULT_TRANSFER_BASE_VALUE_V2));

            IEverValt(weverVault_).wrap(amount, address(this), remainingGas, payload);
        } else {
            msg.sender.transfer({value: 0, flag: MsgFlag.REMAINING_GAS, bounce: false});
        }
    }

    function onAcceptTokensMint(
        address tokenRoot,
        uint128 amount,
        address remainingGasTo,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == weverAddress_, DexErrors.WRONG_RECIPIENT);
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);
        TvmSlice  payloadSlice = payload.toSlice();
        (uint64 id, uint128 amount_, address pairAddress, uint128 expectedAmount, uint128 deployWalletGas) =
            payloadSlice.decode(uint64, uint128, address, uint128, uint128);

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        //successPayload.store(id);
        successPayload.store(remainingGasTo);
        successPayload.store(deployWalletGas);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        //cancelPayload.store(id);
        cancelPayload.store(remainingGasTo);

        TvmBuilder payload2;

        payload2.store(DexOperationTypes.EXCHANGE);
        payload2.store(uint128(0));
        payload2.store(DexGas.DEPLOY_EMPTY_WALLET_VALUE);
        payload2.store(payload);
        payload2.store(id);
        payload2.storeRef(successPayload);
        payload2.storeRef(cancelPayload);

        ITokenWallet(weverAddress_).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
            amount_,
            pairAddress,
            deployWalletGas,
            remainingGasTo,
            true,
            payload2.toCell()
        );
    }

    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address senderWallet,
        address remainingGasTo,
        TvmCell payload
    ) override external {
        TvmSlice payloadSlice = payload.toSlice();
       (uint8 dexOperationType_, uint128 deployWalletGas_, uint8 deployEmptyValue_, TvmCell payload_, uint64 id_) = payloadSlice.decode(uint8, uint128, uint8, TvmCell, uint64);
        if (msg.sender.value != 0 && msg.sender == weverAddress_) {    
            TvmBuilder payloadID;
            payloadID.store(id_);
            TvmCell payloadID_ = payloadID.toCell();

            if (payloadSlice.bits() == 339) { //cancel
                ITokenWallet(weverAddress_).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                    amount,
                    weverVault_,
                    0,
                    remainingGasTo,
                    false,
                    payloadID_
                );
            } else if (payloadSlice.bits() == 476) { //success
                IEverTIP3SwapCallbacks(remainingGasTo).onSuccess{value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: false}(id_, amount);
                ITokenWallet(weverAddress_).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                    amount,
                    remainingGasTo,
                    deployEmptyValue_,
                    remainingGasTo,
                    true,
                    payloadID_
                );

            }
       }
    }

    function onAcceptTokensBurn(
        uint128 amount,
        address walletOwner,
        address wallet,
        address remainingGasTo,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == weverRoot_, DexErrors.NOT_ROOT);
       TvmSlice payloadSlice =  payload.toSlice();
       (uint64 id_) = payloadSlice.decode(uint64);
        IEverTIP3SwapCallbacks(remainingGasTo).onCancel{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(id_);
    }
}