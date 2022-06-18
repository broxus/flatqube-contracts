pragma ton-solidity >= 0.57.1;

import "../structures/IPoint.sol";
import "../structures/IObservation.sol";

/// @title Oracle Interface
/// @notice Base interface for oracle
interface IOracle is IPoint, IObservation {
    /// @dev Emits when the oracle was initialized
    event OracleInitialized(Observation);

    /// @dev Emits when a new point is created
    event OracleUpdated(Observation);

    /// @dev Emits when the minimum interval between points was updated
    event OracleMinIntervalUpdated(uint8);

    /// @dev Emits when observations' cardinality was updated
    event OracleCardinalityUpdated(uint16);

    /// @notice Whether or not oracle was initialized
    /// @return bool Initialization status
    function isInitialized() external view responsible returns (bool);

    /// @notice Sets the minimum interval between points
    /// @dev Only the pair's owner can change
    /// @param _interval The interval between points in seconds up to 255 seconds(4.25 minutes)
    function setMinInterval(uint8 _interval) external;

    /// @notice Get the current minimum interval between points in seconds
    /// @return uint8 Minimum interval in seconds
    function getMinInterval() external view responsible returns (uint8);

    /// @notice Sets bigger cardinality for observations
    /// @dev Only the pair's owner can change
    /// @param _newCardinality A new count of observations
    function setCardinality(uint16 _newCardinality) external;

    /// @notice Get current cardinality
    /// @return uint16 Observations' cardinality
    function getCardinality() external view responsible returns (uint16);
}
