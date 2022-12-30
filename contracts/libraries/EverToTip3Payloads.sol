pragma ton-solidity >= 0.62.0;

import "../libraries/EverToTip3OperationStatus.sol";
import "../libraries/DexOperationTypes.sol";
import "../libraries/PairPayload.sol";

import "../structures/IExchangeStepStructure.sol";

library EverToTip3Payloads {

    // Payload constructor swap Ever -> Tip-3
    function buildExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        uint128 amount,
        address referrer,
        address outcoming
    ) public returns (TvmCell) {
        TvmBuilder builder;

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        TvmCell pairPayload = PairPayload.buildExchangePayloadV2(
            id,
            deployWalletValue,
            expectedAmount,
            address(0), // recipient
            outcoming,
            referrer,
            successPayload.toCell(),
            cancelPayload.toCell()
        );

        builder.store(pair);
        if (amount != 0) {
            builder.store(amount);
        }
        builder.store(pairPayload);
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
        address referrer
    ) public returns (TvmCell) {
        require(steps.length > 0);

        TvmBuilder builder;

        TvmBuilder successPayload;
        successPayload.store(EverToTip3OperationStatus.SUCCESS);
        successPayload.store(id);
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        IExchangeStepStructure.ExchangeStep[] exchangeSteps;
        address[] pools;
        for (uint32 i = 0; i < steps.length; i++) {
            pools.push(steps[i].pool);
            exchangeSteps.push(IExchangeStepStructure.ExchangeStep(steps[i].amount, new address[](0), steps[i].outcoming, steps[i].numerator, steps[i].nextStepIndices));
        }

        TvmCell pairPayload = PairPayload.buildCrossPairExchangePayloadV2(
            id,
            deployWalletValue,
            address(0), // recipient
            expectedAmount,
            outcoming,
            nextStepIndices,
            exchangeSteps,
            pools,
            referrer,
            successPayload.toCell(),
            cancelPayload.toCell()
        );

        builder.store(pool);
        if (amount != 0) {
            builder.store(amount);
        }
        builder.store(pairPayload);

        return builder.toCell();
    }
}
