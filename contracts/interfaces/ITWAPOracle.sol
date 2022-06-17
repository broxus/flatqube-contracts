pragma ton-solidity >= 0.57.1;

import "./IOracle.sol";
import "../structures/IRate.sol";

/// @title TWAP-Oracle Interface
/// @notice Interface for interaction with pair's TWAP-Oracle
interface ITWAPOracle is IOracle, IRate {
    /// @dev Emits when the minimum rate's delta between points was updated
    event OracleMinRateDeltaUpdated(uint);

    /// @notice Sets the minimum rate's delta between points
    /// @dev Only the pair's owner can change
    /// @param _delta Percent in FP128 representation. 0.01 * 2 ** 128 == 1%
    /// @return bool Whether or not minRateDelta was updated
    function setMinRateDelta(uint _delta) external responsible returns (bool);

    /// @notice Get the current minimum rate delta in FP128 representation
    /// @return uint Minimum rate delta in FP128 representation
    function getMinRateDelta() external view responsible returns (uint);

    /// @notice Get observation by timestamp
    /// @param _timestamp UNIX timestamp in seconds of the observation
    /// @return optional(Observation) Observation by timestamp or null if it doesn't exist
    function getObservation(uint32 _timestamp) external view responsible returns (optional(Observation));

    /// @notice Get a callback with an observation by timestamp
    /// @param _timestamp UNIX timestamp in seconds of the observation
    /// @param _payload Any extra data to return in callback
    function observation(
        uint32 _timestamp,
        TvmCell _payload
    ) external view;

    /// @notice Calculates TWAP for the given interval
    /// @dev If there is no point with a timestamp equal to _fromTimestamp or _toTimestamp
    /// will take the point with the nearest timestamp
    /// @param _fromTimestamp Start of interval for TWAP
    /// @param _toTimestamp End of interval for TWAP
    /// @return optional(Rate) Packed rate info in the time range between _fromTimestamp and _toTimestamp
    /// or null if impossible to calculate
    function getRate(
        uint32 _fromTimestamp,
        uint32 _toTimestamp
    ) external view responsible returns (optional(Rate));

    /// @notice Get a callback with calculated TWAP for the given interval
    /// @dev If there is no point with a timestamp equal to _fromTimestamp or _toTimestamp
    /// will take the point with the nearest timestamp
    /// @param _fromTimestamp Start of interval for TWAP
    /// @param _toTimestamp End of interval for TWAP
    /// @param _payload Any extra data to return in callback
    function rate(
        uint32 _fromTimestamp,
        uint32 _toTimestamp,
        TvmCell _payload
    ) external view;
}
