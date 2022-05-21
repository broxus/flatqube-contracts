pragma ton-solidity >= 0.57.0;

interface IHasEmergencyMode {
  function enableEmergency(uint256 _emergencyManager) external;
  function disableEmergency() external;
}