pragma ton-solidity >= 0.57.1;

/// @title ReferralProgram-callbacks Interface
/// @notice Interface for ReferralProgram-callbacks implementation
interface IReferralProgramCallbacks {
    function onRefLastUpdate(
        address referred,
        address referrer,
        address remainingGasTo
    ) external;
}
