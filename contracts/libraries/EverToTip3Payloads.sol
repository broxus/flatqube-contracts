pragma ton-solidity >= 0.57.0;

import "../structures/ITokenOperationStructure.sol";
import "../libraries/EverToTip3OperationStatus.sol";
import "../libraries/DexOperationTypes.sol";

library EverToTip3Payloads {

    // Payload constructor swap Ever -> Tip-3
    function buildExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        uint128 amount
    ) public returns (TvmCell) {
        TvmBuilder builder;
        TvmBuilder pairPayload;

        //328
        pairPayload.store(DexOperationTypes.EXCHANGE);
        pairPayload.store(id);
        pairPayload.store(deployWalletValue);
        pairPayload.store(expectedAmount);

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

    // Payload constructor swap Ever -> Tip-3 via cross-pair
    function buildCrossPairExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        ITokenOperationStructure.TokenOperation[] steps,
        uint128 amount
    ) public returns (TvmCell) {
        require(steps.length > 0);

        TvmBuilder builder;
        TvmBuilder pairPayload;

        // 595
        pairPayload.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        pairPayload.store(id);
        pairPayload.store(deployWalletValue);
        pairPayload.store(expectedAmount);
        pairPayload.store(steps[0].root);

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
        successPayload.store(deployWalletValue);

        TvmBuilder cancelPayload;
        cancelPayload.store(EverToTip3OperationStatus.CANCEL);
        cancelPayload.store(id);
        cancelPayload.store(deployWalletValue);

        pairPayload.storeRef(nextStepBuilder);
        pairPayload.storeRef(successPayload);
        pairPayload.storeRef(cancelPayload);

        builder.store(pair);
        if (amount != 0) {
            builder.store(amount);
        }
        builder.storeRef(pairPayload);

        return builder.toCell();
    }
}
