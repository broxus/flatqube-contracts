pragma ton-solidity >= 0.62.0;

/// @title DEX Pool Balances Interface
/// @notice Structure for packed pool's reserves
interface IDexPoolBalances {
    /// @dev Packed reserves of the pool
    struct DexPoolBalances {
        uint128[] balances;
        uint128 lp_supply;
    }
}
