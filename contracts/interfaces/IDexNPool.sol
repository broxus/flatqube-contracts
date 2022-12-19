pragma ton-solidity >= 0.62.0;

import "./IDexBasePool.sol";
import "../structures/IDexPoolBalances.sol";
import "../structures/IDepositLiquidityResultV2.sol";
import "../structures/IWithdrawResultV2.sol";

interface IDexNPool is IDexBasePool, IDexPoolBalances, IDepositLiquidityResultV2, IWithdrawResultV2 {

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // EVENTS

    /// @dev Emits when liquidity deposit was successfully processed
    event DepositLiquidityV2(
        address sender,
        address owner,
        TokenOperation[] tokens,
        ExchangeFee[] fees,
        TokenOperation[] spent_differences,
        TokenOperation[] receive_differences,
        uint128 lp
    );

    /// @dev Emits when liquidity withdrawal was successfully processed
    event WithdrawLiquidityV2(
        address sender,
        address owner,
        uint128 lp,
        TokenOperation[] tokens,
        ExchangeFee[] fees,
        TokenOperation[] spent_differences,
        TokenOperation[] receive_differences
    );

/// @dev Emits when pool's code was successfully upgraded
    event PoolCodeUpgraded(
        uint32 version,
        uint8 pool_type
    );

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // GETTERS

    /// @notice Get TIP-3 tokens' roots of the pool
    /// @return token_roots Packed info response about TokenRoots addresses
    function getTokenRoots() external view responsible returns (
        address[] token_roots,
        address lp_root
    );

    /// @notice Get TIP-3 tokens' wallets of the pool
    /// @return token_wallets Packed info response about TokenWallets addresses
    function getTokenWallets() external view responsible returns (
        address[] token_wallets,
        address lp
    );

    /// @notice Get TIP-3 tokens' wallets of the DEX vault
    /// @return token_vault_wallets Packed info response about TokenWallets addresses
    function getVaultWallets() external view responsible returns (
        address[] token_vault_wallets,
        address lp_vault_wallet
    );

    /// @notice Get pool's reserves
    /// @return DexPoolBalances Current reserves of the pool
    function getBalances() external view responsible returns (DexPoolBalances);

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // DEPOSIT LIQUIDITY

    /// @notice Calculate expected LP tokens amount after liquidity deposit
    /// @param amounts Input amounts
    function expectedDepositLiquidityV2(
        uint128[] amounts
    ) external view responsible returns (
        DepositLiquidityResultV2
    );

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // WITHDRAW LIQUIDITY

    /// @notice Calculate expected output amounts after liquidity withdrawal
    /// @param lp_amount Amount of LP tokens to burn
    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) external view responsible returns (
        WithdrawResultV2
    );

    /// @notice Calculate expected output amount after a single coin withdrawal
    /// @param lp_amount Amount of LP tokens to burn
    /// @param outcoming Withdrawal token address
    function expectedWithdrawLiquidityOneCoin(
        uint128 lp_amount,
        address outcoming
    ) external view responsible returns (
        WithdrawResultV2
    );

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // SWAP

    /// @notice Calculate expected fees and output amount for swap
    /// @param amount Input amount
    /// @param spent_token_root Input TIP-3 TokenRoot
    /// @param receive_token_root Output TIP-3 TokenRoot
    /// @return expected_amount Fees and output amount after swap
    function expectedExchange(
        uint128 amount,
        address spent_token_root,
        address receive_token_root
    ) external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    );

    /// @notice Calculate expected fees and input amount for swap
    /// @param receive_amount Output amount
    /// @param receive_token_root Output TIP-3 TokenRoot
    /// @param spent_token_root Input TIP-3 TokenRoot
    /// @return expected_amount Fees and input amount before swap
    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root,
        address spent_token_root
    ) external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    );
}
