pragma ton-solidity >= 0.62.0;

/// @title Address Types
/// @notice Utility address types to use
library DexAddressType {
    /// @dev TIP-3 TokenRoots of reserves
    uint8 constant RESERVE = 1;

    /// @dev TIP-3 TokenRoot of the LP token
    uint8 constant LP = 2;

    /// @dev DEX vault address
    uint8 constant VAULT = 3;
}
