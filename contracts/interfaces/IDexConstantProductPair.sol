pragma ton-solidity >= 0.57.0;

import "./IDexPair.sol";
import "../structures/IDepositLiquidityResult.sol";

interface IDexConstantProductPair is IDexPair, IDepositLiquidityResult {

    function expectedDepositLiquidity(
        uint128 left_amount,
        uint128 right_amount,
        bool auto_change
    ) external view responsible returns (DepositLiquidityResult);

}
