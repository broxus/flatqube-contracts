pragma ton-solidity >= 0.57.0;

import "../structures/IPartExchangeResult.sol";
import "../structures/IStateChangedResult.sol";
import "../structures/ISwapResult.sol";
import "../structures/ICreateOrderResult.sol";
import "../structures/ICreateOrderRejectResult.sol";
import "../structures/IOnCodeUpgradeResult.sol";

interface IOrderOperationCallback {
    function orderPartExchangeSuccess(uint64 id, IPartExchangeResult.PartExchangeResult result) external;
    function orderStateChangedSuccess(optional(uint64) id, IStateChangedResult.StateChangedResult result) external;
    function orderSwapSuccess(uint64 id, ISwapResult.SwapResult result) external;
    function orderSwapCancel(uint64 id) external;
    function orderCreateOrderSuccess(uint64 id, ICreateOrderResult.CreateOrderResult result) external;
    function orderCreateOrderReject(uint64 id, ICreateOrderRejectResult.CreateOrderRejectResult result) external;
    function onCodeUpgradeSuccess(uint64 id, IOnCodeUpgradeResult.OnCodeUpgradeResult result) external;
}