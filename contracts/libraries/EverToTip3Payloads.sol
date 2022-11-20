pragma ton-solidity >= 0.57.0;

import "../libraries/EverToTip3OperationStatus.sol";
import "../libraries/DexOperationTypes.sol";
import "../structures/INextExchangeData.sol";

library EverToTip3Payloads {

    // Payload constructor swap Ever -> Tip-3
    function buildExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        uint128 amount,
        address recipient,
        address outcoming
    ) public returns (TvmCell) {
        TvmBuilder builder;
        TvmBuilder pairPayload;

        //595
        pairPayload.store(DexOperationTypes.EXCHANGE_V2);
        pairPayload.store(id);
        pairPayload.store(deployWalletValue);
        pairPayload.store(expectedAmount);
        pairPayload.store(recipient);
        pairPayload.store(outcoming);

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(pair);
        if (amount != 0) {
            builder.store(amount);
        }
        builder.storeRef(pairPayload);
        return builder.toCell();
    }

    struct EverToTip3ExchangeStep {
        uint128 amount;
        address pool;
        address outcoming;
        uint128 numerator;
        uint32[] nextStepIndices;
    }

    // Payload constructor swap Ever -> Tip-3 via split-cross-pool
    function buildCrossPairExchangePayload(
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
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        pairPayload.store(nextStepsCell);
        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(pool);
        if (amount != 0) {
            builder.store(amount);
        }
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
}
