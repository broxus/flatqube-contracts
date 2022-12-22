pragma ton-solidity >= 0.62.0;

interface IHasEmergencyMode {
  function enableEmergency(uint256 _emergencyManager) external;
  function disableEmergency() external;
}