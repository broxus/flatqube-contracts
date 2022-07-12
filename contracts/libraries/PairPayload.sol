pragma ton-solidity >= 0.57.0;

import "../structures/ITokenOperationStructure.sol";

import "./DexOperationTypes.sol";

library PairPayload {
    function buildExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        builder.store(expected_amount);

        return builder.toCell();
    }

    function buildDepositLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY);
        builder.store(id);
        builder.store(deploy_wallet_grams);

        return builder.toCell();
    }

    function buildWithdrawLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY);
        builder.store(id);
        builder.store(deploy_wallet_grams);

        return builder.toCell();
    }

    function buildCrossPairExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        ITokenOperationStructure.TokenOperation[] steps
    ) public returns (TvmCell) {
        require(steps.length > 0);
        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        builder.store(expected_amount);
        builder.store(steps[0].root);

        TvmBuilder next_step_builder;
        next_step_builder.store(steps[steps.length - 1].amount);

        for (uint i = steps.length - 1; i > 0; i--) {
            TvmBuilder current_step_builder;

            current_step_builder.store(steps[i - 1].amount, steps[i].root);
            current_step_builder.store(next_step_builder.toCell());

            next_step_builder = current_step_builder;
        }

        builder.store(next_step_builder.toCell());

        return builder.toCell();
    }
}
