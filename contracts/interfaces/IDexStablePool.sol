pragma ton-solidity >= 0.57.0;

import "./IDexNPool.sol";
import "../structures/IAmplificationCoefficient.sol";
import "../structures/IDepositLiquidityResultV2.sol";

interface IDexStablePool is IDexNPool, IAmplificationCoefficient, IDepositLiquidityResultV2 {

    event AmplificationCoefficientUpdated(AmplificationCoefficient A);

    function expectedDepositLiquidityV2(uint128[] amounts) external view responsible returns (DepositLiquidityResultV2);

    function getAmplificationCoefficient() external view responsible returns (AmplificationCoefficient);

    function setAmplificationCoefficient(AmplificationCoefficient _A, address send_gas_to) external;

    function getVirtualPrice() external view responsible returns (optional(uint256));
}
