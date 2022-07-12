pragma ton-solidity >= 0.57.0;

import "../structures/ITokenOperationStructure.sol";

import "./DexOperationTypes.sol";

library PairPayload {
    function buildExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);

        return builder.toCell();
    }

    function buildDepositLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);

        return builder.toCell();
    }

    function buildWithdrawLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);

        return builder.toCell();
    }

    function buildCrossPairExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        ITokenOperationStructure.TokenOperation[] _steps
    ) public returns (TvmCell) {
        require(_steps.length > 0);

        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);
        builder.store(_steps[0].root);

        TvmBuilder nextStepBuilder;
        nextStepBuilder.store(_steps[_steps.length - 1].amount);

        for (uint i = _steps.length - 1; i > 0; i--) {
            TvmBuilder currentStepBuilder;

            currentStepBuilder.store(_steps[i - 1].amount, _steps[i].root);
            currentStepBuilder.store(nextStepBuilder.toCell());

            nextStepBuilder = currentStepBuilder;
        }

        builder.store(nextStepBuilder.toCell());

        return builder.toCell();
    }
}
