pragma ton-solidity >= 0.62.0;

import "./IDexPair.sol";
import "../structures/IAmplificationCoefficient.sol";
import "../structures/IDepositLiquidityResultV2.sol";

interface IDexStablePair is IDexPair, IAmplificationCoefficient, IDepositLiquidityResultV2 {

    event AmplificationCoefficientUpdated(AmplificationCoefficient A);

    function expectedDepositLiquidityV2(uint128[] amounts) external view responsible returns (DepositLiquidityResultV2);

    function getAmplificationCoefficient() external view responsible returns (AmplificationCoefficient);

    function setAmplificationCoefficient(AmplificationCoefficient _A, address send_gas_to) external;

    function getVirtualPrice() external view responsible returns (optional(uint256));
}
