pragma ton-solidity >= 0.57.1;

/// @title Oracle Options Interface
/// @notice Structure for packed oracle's options
interface IOracleOptions {
    /// @dev Options structure
    struct OracleOptions {
        /// @dev Minimum interval in seconds between points up to 255 seconds(4.25 minutes)
        uint8 minInterval;

        /// @dev Minimum rate percent delta in FP128 representation to write the next point
        uint minRateDelta;

        /// @dev Maximum count of points up to 65535
        uint16 cardinality;
    }
}
