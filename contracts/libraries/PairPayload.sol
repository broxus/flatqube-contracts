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

    function decodeOnAcceptTokensTransferPayload(TvmCell _payload) public returns (
        bool,
        uint64,
        uint8,
        uint128,
        uint128,
        address,
        bool,
        TvmCell,
        bool,
        TvmCell,
        bool,
        TvmCell
    ) {
        TvmSlice payloadSlice = _payload.toSlice();

        uint refsCount = payloadSlice.refs();

        bool notifySuccess = refsCount >= 1;
        bool notifyCancel = refsCount >= 2;
        bool hasRef3 = refsCount >= 3;
        bool isValid = payloadSlice.bits() >= 200;

        uint8 op;
        uint64 id;
        uint128 deployWalletGrams;
        uint128 expectedAmount;
        address nextTokenRoot;

        TvmCell successPayload;
        TvmCell cancelPayload;
        TvmCell ref3;

        if (notifySuccess) {
            successPayload = payloadSlice.loadRef();
        }

        if (notifyCancel) {
            cancelPayload = payloadSlice.loadRef();
        }

        if (hasRef3) {
            ref3 = payloadSlice.loadRef();
        }

        if (isValid) {
            (
                op,
                id,
                deployWalletGrams
            ) = payloadSlice.decode(
                uint8,
                uint64,
                uint128
            );

            if (payloadSlice.bits() >= 128) {
                expectedAmount = payloadSlice.decode(uint128);
            }

            if (payloadSlice.bits() >= 267) {
                nextTokenRoot = payloadSlice.decode(address);
            }
        }

        return (
            isValid,
            id,
            op,
            deployWalletGrams,
            expectedAmount,
            nextTokenRoot,
            hasRef3,
            ref3,
            notifySuccess,
            successPayload,
            notifyCancel,
            cancelPayload
        );
    }
}
