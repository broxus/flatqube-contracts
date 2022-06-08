pragma ton-solidity >= 0.57.0;

import "../structures/IDepositLiquidityResult.sol";
import "../structures/IDepositLiquidityResultV2.sol";
import "../structures/IExchangeResult.sol";
import "../structures/IWithdrawResult.sol";

interface IDexPairOperationCallback {
    function dexPairDepositLiquiditySuccess(uint64 id, bool via_account, IDepositLiquidityResult.DepositLiquidityResult result) external;
    function dexPairDepositLiquiditySuccessV2(uint64 id, bool via_account, IDepositLiquidityResultV2.DepositLiquidityResultV2 result) external;
    function dexPairExchangeSuccess(uint64 id, bool via_account, IExchangeResult.ExchangeResult result) external;
    function dexPairWithdrawSuccess(uint64 id, bool via_account, IWithdrawResult.WithdrawResult result) external;
    function dexPairOperationCancelled(uint64 id) external;
}
