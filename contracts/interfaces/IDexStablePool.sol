pragma ton-solidity >= 0.62.0;

import "./IDexNPool.sol";
import "../structures/IAmplificationCoefficient.sol";

interface IDexStablePool is IDexNPool, IAmplificationCoefficient {

    event AmplificationCoefficientUpdated(AmplificationCoefficient A);

    function getAmplificationCoefficient() external view responsible returns (AmplificationCoefficient);

    function setAmplificationCoefficient(AmplificationCoefficient _A, address send_gas_to) external;

    function getVirtualPrice() external view responsible returns (optional(uint256));
}
