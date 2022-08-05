pragma ton-solidity >= 0.57.0;

import "../structures/ITokenOperationStructure.sol";

import "./DexOperationTypes.sol";

/**
 * @title DEX Pair Payloads Utility
 * @notice Utility for building pair's payloads
 */
library DexPayloads {
    /**
     * @notice Build payload for TIP-3 token transfer with exchange operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum token amount after swap
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_expectedAmount);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity deposit operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum LP token amount after deposit
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildDepositLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_expectedAmount);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity withdrawal operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedLeftAmount Minimum pair's left token amount after withdrawal
     * @param _expectedRightAmount Minimum pair's right token amount after withdrawal
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildWithdrawLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedLeftAmount,
        uint128 _expectedRightAmount,
        address _recipient
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_expectedLeftAmount);
        builder.store(_expectedRightAmount);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with cross-pair exchange operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum token amount after the first swap
     * @param _steps Next pairs' root and expected amount
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildCrossPairExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        ITokenOperationStructure.TokenOperation[] _steps,
        address _recipient
    ) public returns (TvmCell) {
        // Check that at least 1 next pair is exists
        require(_steps.length > 0);

        // Pack data for the first pair
        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_expectedAmount);
        builder.store(_steps[0].root);

        // Pack data for next pairs
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

    /**
     * @notice Decode user's params from onAcceptTokensTransfer callback
     * @param _payload Payload from transfer callback
     * @return bool Whether or not payload is valid
     * @return uint8 ID of the call
     * @return uint64 Type of the operation
     * @return uint128 Amount of EVER for a new TIP-3 wallet deploy
     * @return address Address of the receiver
     * @return uint128 Expected amount or expected left amount for liquidity withdrawal
     * @return uint128 Expected right amount for liquidity withdrawal
     * @return address Next TokenRoot address for cross-pair exchange
     */
    function decodeOnAcceptTokensTransferData(TvmCell _payload) public returns (
        bool,
        uint8,
        uint64,
        uint128,
        address,
        uint128,
        uint128,
        address
    ) {
        TvmSlice slice = _payload.toSlice();

        // Check size
        bool isValid = slice.bits() >= 595;

        // Default empty params
        uint8 op;
        uint64 id;
        uint128 deployWalletGrams;
        address recipient;
        uint128 expectedAmount;
        uint128 expectedAmount2;
        address nextTokenRoot;

        if (isValid) {
            (
                op,
                id,
                deployWalletGrams,
                recipient,
                expectedAmount
            ) = slice.decode(
                uint8,
                uint64,
                uint128,
                address,
                uint128
            );

            uint remainingBits = slice.bits();

            if (remainingBits >= 267) {
                nextTokenRoot = slice.decode(address);
            } else if (remainingBits >= 128) {
                expectedAmount2 = slice.decode(uint128);
            }
        }

        return (
            isValid,
            op,
            id,
            deployWalletGrams,
            recipient,
            expectedAmount,
            expectedAmount2,
            nextTokenRoot
        );
    }

    /**
     * @notice Decode user's payloads from onAcceptTokensTransfer callback
     * @param _payload Payload from transfer callback
     * @return bool Whether or not success payload exists
     * @return TvmCell Payload for success
     * @return bool Whether or not cancel payload exists
     * @return TvmCell Payload for cancel
     * @return bool Whether or not other data exists
     * @return TvmCell Other data
     */
    function decodeOnAcceptTokensTransferPayloads(TvmCell _payload) public returns (
        bool,
        TvmCell,
        bool,
        TvmCell,
        bool,
        TvmCell
    ) {
        TvmSlice slice = _payload.toSlice();
        uint8 refs = slice.refs();

        // Check size
        bool notifySuccess = refs >= 1;
        bool notifyCancel = refs >= 2;
        bool hasRef3 = refs >= 3;

        TvmCell successPayload;
        TvmCell cancelPayload;
        TvmCell ref3;

        if (notifySuccess) { successPayload = slice.loadRef(); }

        if (notifyCancel) { cancelPayload = slice.loadRef(); }

        if (hasRef3) { ref3 = slice.loadRef(); }

        return (
            notifySuccess,
            successPayload,
            notifyCancel,
            cancelPayload,
            hasRef3,
            ref3
        );
    }
}
