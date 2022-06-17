pragma ton-solidity >= 0.57.1;

/// @title FP128 Utility
/// @dev Range: [0, 2 ** 128 - 1]. Resolution: 1 / 2 ** 128
library FixedPoint128 {
    // @dev Multiplier to transform an integer to FP128 format
    uint constant FIXED_POINT_128_MULTIPLIER = 2 ** 128;

    /// @notice Transforms an integer to FP128 format
    /// @param _a Number to transform
    /// @return uint Same number in FP128 representation
    function encode(uint128 _a) internal returns (uint) {
        return uint(_a) * FIXED_POINT_128_MULTIPLIER;
    }

    /// @notice Divides FP128 number on other non-FP128
    /// @param _a FP128 number
    /// @param _b non-FP128 number
    /// @return uint Division result in FP128 representation
    function div(uint _a, uint128 _b) internal returns (uint) {
        return _a / uint(_b);
    }
}
