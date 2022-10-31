pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/EverToTip3Gas.sol";
import "./libraries/EverToTip3Errors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./interfaces/IEverTip3SwapEvents.sol";
import "./interfaces/IEverTip3SwapCallbacks.sol";

import "./structures/ITokenOperationStructure.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensBurnCallback.sol";

contract Tip3ToEver is IAcceptTokensTransferCallback, IAcceptTokensBurnCallback, IEverTip3SwapEvents {

    uint32 static randomNonce_;

    address static public weverRoot;
    address static public weverVault;

    address public weverWallet;

    constructor() public {
        tvm.accept();

        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        ITokenRoot(weverRoot).deployWallet{
            value: EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: Tip3ToEver.onWeverWallet
        }(
            address(this),
            EverToTip3Gas.DEPLOY_EMPTY_WALLET_GRAMS
        );

        msg.sender.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
    }

    // Сallback deploy WEVER wallet for contract
    function onWeverWallet(address _weverWallet) external {
        require(msg.sender.value != 0 && msg.sender == weverRoot, EverToTip3Errors.NOT_WEVER_ROOT);
        weverWallet = _weverWallet;
        weverWallet.transfer(0, false, MsgFlag.REMAINING_GAS + MsgFlag.IGNORE_ERRORS);
    }

    // Payload constructor swap TIP-3 -> Ever
    function buildExchangePayload(
        address pair,
        uint64 id,
        uint128 expectedAmount,
        optional(address) recipient
    ) public pure returns (TvmCell) {
        TvmBuilder builder;
        TvmBuilder pairPayload;

        //595
        pairPayload.store(DexOperationTypes.EXCHANGE);
        pairPayload.store(id);
        pairPayload.store(uint128(0));
        pairPayload.store(expectedAmount);
        pairPayload.store(recipient.hasValue() ? recipient.get() : address(0));

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(uint128(0));

        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(EverToTip3OperationStatus.SWAP);
        builder.store(pair);
        builder.storeRef(pairPayload);
        return builder.toCell();
    }

    function buildCrossPairExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        ITokenOperationStructure.TokenOperation[] steps,
        optional(address) recipient
    ) public pure returns (TvmCell) {
        require(steps.length > 0);

        TvmBuilder builder;
        TvmBuilder pairPayload;

        // 595
        pairPayload.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        pairPayload.store(id);
        pairPayload.store(deployWalletValue);
        pairPayload.store(expectedAmount);
        pairPayload.store(steps[0].root);
        pairPayload.store(recipient.hasValue() ? recipient.get() : address(0));

        TvmBuilder nextStepBuilder;
        nextStepBuilder.store(steps[steps.length - 1].amount);

        for (uint i = steps.length - 1; i > 0; i--) {
            TvmBuilder currentStepBuilder;
            currentStepBuilder.store(steps[i - 1].amount, steps[i].root);
            currentStepBuilder.store(nextStepBuilder.toCell());
            nextStepBuilder = currentStepBuilder;
        }

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        pairPayload.storeRef(nextStepBuilder);
        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(EverToTip3OperationStatus.SWAP);
        builder.store(pair);
        builder.storeRef(pairPayload);

        return builder.toCell();
    }

    // Payload constructor swap TIP-3 -> Ever via split-cross-pool
    function buildCrossPairExchangePayloadV2(
        address pool,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        address outcoming,
        uint32[] nextStepIndices,
        EverToTip3ExchangeStep[] steps,
        uint128 amount,
        address recipient
    ) public returns (TvmCell) {
        require(steps.length > 0);

        TvmBuilder builder;
        TvmBuilder pairPayload;

        pairPayload.store(DexOperationTypes.CROSS_PAIR_EXCHANGE_V2);
        pairPayload.store(id);
        pairPayload.store(deployWalletValue);
        pairPayload.store(expectedAmount);
        pairPayload.store(recipient);
        pairPayload.store(outcoming);

        INextExchangeData.NextExchangeData[] nextSteps;
        for (uint32 idx : nextStepIndices) {
            (TvmCell nextPayload, uint32 nestedNodes, uint32 leaves) = _encodeCrossPairExchangeData(steps, idx);
            nextSteps.push(INextExchangeData.NextExchangeData(
                steps[idx].numerator,
                steps[idx].pool,
                nextPayload,
                nestedNodes,
                leaves
            ));
        }
        TvmCell nextStepsCell = abi.encode(nextSteps);

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        pairPayload.store(nextStepsCell);
        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(EverToTip3OperationStatus.SWAP);
        builder.store(pool);
        builder.storeRef(pairPayload);

        return builder.toCell();
    }

    function _encodeCrossPairExchangeData(
        EverToTip3ExchangeStep[] _steps,
        uint32 _currentIdx
    ) private returns (TvmCell, uint32, uint32) {
        INextExchangeData.NextExchangeData[] nextSteps;
        uint32 nextLevelNodes = 0;
        uint32 nextLevelLeaves = 0;
        for (uint32 idx : _steps[_currentIdx].nextStepIndices) {
            (TvmCell nextPayload, uint32 nestedNodes, uint32 leaves) = _encodeCrossPairExchangeData(_steps, idx);
            nextLevelNodes += nestedNodes;
            nextLevelLeaves += leaves;
            nextSteps.push(INextExchangeData.NextExchangeData(
                _steps[idx].numerator,
                _steps[idx].pool,
                nextPayload,
                nestedNodes,
                leaves
            ));
        }

        return (
            abi.encode(_steps[_currentIdx].amount, _steps[_currentIdx].outcoming, nextSteps),
            nextLevelNodes + uint32(nextSteps.length),
            nextSteps.length > 0 ? nextLevelLeaves : 1
        );
    }

    // Callback result swap
    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address /*senderWallet*/,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0);
        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        TvmSlice payloadSlice = payload.toSlice();

        uint8 operationStatus = EverToTip3OperationStatus.UNKNOWN;

        if (payloadSlice.bits() >= 8) {
            operationStatus = payloadSlice.decode(uint8);
        }

        if (
            payloadSlice.bits() == 267 && payloadSlice.refs() == 1 &&
            operationStatus == EverToTip3OperationStatus.SWAP &&
            msg.value >= EverToTip3Gas.SWAP_TIP3_TO_EVER_MIN_VALUE
        ) {
            address pair = payloadSlice.decode(address);
            TvmCell ref1 = payloadSlice.loadRef();

            ITokenWallet(msg.sender).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                amount,
                pair,
                uint128(0),
                user,
                true,
                ref1
            );
        } else if (
            payloadSlice.bits() == 192 &&
            operationStatus == EverToTip3OperationStatus.CANCEL
        ) {
            (uint64 id_, uint128 deployWalletValue_) = payloadSlice.decode(uint64, uint128);
            TvmBuilder payloadID;
            payloadID.store(id_);

            emit SwapTip3EverCancelTransfer(user, id_, amount, tokenRoot);
            IEverTip3SwapCallbacks(user).onSwapTip3ToEverCancel{
                value: 0,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(id_, amount, tokenRoot);

            ITokenWallet(msg.sender).transfer{value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false}(
                amount,
                user,
                deployWalletValue_,
                user,
                true,
                payloadID.toCell()
            );
        } else if(
            payloadSlice.bits() == 64 &&
            operationStatus == EverToTip3OperationStatus.SUCCESS &&
            (msg.sender.value != 0 && msg.sender == weverWallet)
        ) {
            uint64 id_ = payloadSlice.decode(uint64);
            TvmBuilder payloadID;
            payloadID.store(id_);

            ITokenWallet(weverWallet).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                weverVault,
                uint128(0),
                user,
                true,
                payloadID.toCell()
            );
        } else {
            TvmCell emptyPayload;
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                user,
                sender != user ? 0.1 ever : 0,
                user,
                true,
                emptyPayload
            );
        }
    }

    // Callback Burn token if result swap success
    function onAcceptTokensBurn(
        uint128 amount,
        address /*walletOwner*/,
        address /*wallet*/,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == weverRoot, EverToTip3Errors.NOT_WEVER_ROOT);
        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        TvmSlice payloadSlice =  payload.toSlice();
        uint64 id = payloadSlice.decode(uint64);

        emit SwapTip3EverSuccessTransfer(user, id, amount);
        IEverTip3SwapCallbacks(user).onSwapTip3ToEverSuccess{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(id, amount);
    }

    fallback() external pure {  }

}
