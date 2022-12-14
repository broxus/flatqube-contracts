pragma ton-solidity >= 0.62.0;

import "../structures/IDepositLiquidityResult.sol";
import "../structures/IDepositLiquidityResultV2.sol";
import "../structures/IExchangeResult.sol";
import "../structures/IExchangeResultV2.sol";
import "../structures/IWithdrawResult.sol";
import "../structures/IWithdrawResultV2.sol";

interface IDexPairOperationCallback {
    function dexPairDepositLiquiditySuccess(uint64 id, bool via_account, IDepositLiquidityResult.DepositLiquidityResult result) external;
    function dexPairDepositLiquiditySuccessV2(uint64 id, bool via_account, IDepositLiquidityResultV2.DepositLiquidityResultV2 result) external;
    function dexPairExchangeSuccess(uint64 id, bool via_account, IExchangeResult.ExchangeResult result) external;
    function dexPairExchangeSuccessV2(uint64 id, bool via_account, IExchangeResultV2.ExchangeResultV2 result) external;
    function dexPairWithdrawSuccess(uint64 id, bool via_account, IWithdrawResult.WithdrawResult result) external;
    function dexPairWithdrawSuccessV2(uint64 id, bool via_account, IWithdrawResultV2.WithdrawResultV2 result) external;
    function dexPairOperationCancelled(uint64 id) external;
}
