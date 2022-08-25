pragma ton-solidity >= 0.57.0;

import "../structures/IDepositLiquidityResult.sol";

import "./IDexPair.sol";

/**
 * @title DEX Pair Interface
 * @notice Interface for pair with constant product formula logic aka k = y * x
 */
interface IDexConstantProductPair is IDexPair, IDepositLiquidityResult {
    /**
     * @notice Calculate expected result of liquidity deposit for given amounts
     * @param left_amount Amount of the left token for deposit
     * @param right_amount Amount of the right token to deposit
     * @param auto_change Whether or not swap incoming amounts with the current pair's reserves ratio
     * @return DepositLiquidityResult Data about expected deposit's steps
     */
    function expectedDepositLiquidity(
        uint128 left_amount,
        uint128 right_amount,
        bool auto_change
    ) external view responsible returns (DepositLiquidityResult);

    /**
     * @notice Build payload for TIP-3 token transfer with exchange operation
     * @param id ID of the call
     * @param deploy_wallet_grams Amount of EVER for a new TIP-3 wallet deploy
     * @param expected_amount Minimum token amount after swap
     * @param recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        optional(address) recipient
    ) external pure returns (TvmCell);

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity deposit operation
     * @param id ID of the call
     * @param deploy_wallet_grams Amount of EVER for a new TIP-3 wallet deploy
     * @param expected_amount Minimum LP token amount after deposit
     * @param recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildDepositLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        optional(uint128) expected_amount,
        optional(address) recipient
    ) external pure returns (TvmCell);

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity withdrawal operation
     * @param id ID of the call
     * @param deploy_wallet_grams Amount of EVER for a new TIP-3 wallet deploy
     * @param expected_left_amount Minimum pair's left token amount after withdrawal
     * @param expected_right_amount Minimum pair's right token amount after withdrawal
     * @param recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildWithdrawLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        optional(uint128) expected_left_amount,
        optional(uint128) expected_right_amount,
        optional(address) recipient
    ) external pure returns (TvmCell);

    /**
     * @notice Build payload for TIP-3 token transfer with cross-pair exchange operation
     * @param id ID of the call
     * @param deploy_wallet_grams Amount of EVER for a new TIP-3 wallet deploy
     * @param expected_amount Minimum token amount after the first swap
     * @param steps Next pairs' root and expected amount
     * @param recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildCrossPairExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        TokenOperation[] steps,
        optional(address) recipient
    ) external pure returns (TvmCell);
}
