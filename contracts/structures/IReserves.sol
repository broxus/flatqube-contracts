pragma ton-solidity >= 0.57.1;

/// @title Reserves Interface
/// @notice Structure for packed pair's reserves
interface IReserves {
    /// @dev Packed reserves of the pair
    struct Reserves {
        uint token0;
        uint token1;
    }
}
