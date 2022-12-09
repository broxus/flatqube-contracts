pragma ton-solidity >= 0.57.0;

import "../structures/IPartExchangeResult.sol";
import "../structures/IStateChangedResult.sol";
import "../structures/ISwapResult.sol";
import "../structures/ICreateOrderResult.sol";
import "../structures/ICreateOrderRejectResult.sol";
import "../structures/IOnOrderRootCreateResult.sol";

interface IOrderOperationCallback {
    function onOrderPartExchangeSuccess(uint64 id, IPartExchangeResult.PartExchangeResult result) external;
    function onOrderStateChangedSuccess(optional(uint64) id, IStateChangedResult.StateChangedResult result) external;
    function onOrderSwapSuccess(uint64 id, ISwapResult.SwapResult result) external;
    function onOrderSwapCancel(uint64 id) external;
    function onOrderCreateOrderSuccess(uint64 id, ICreateOrderResult.CreateOrderResult result) external;
    function onOrderCreateOrderReject(uint64 id, ICreateOrderRejectResult.CreateOrderRejectResult result) external;
    function onOrderRootCreateSuccess(uint64 id, IOnOrderRootCreateResult.OnOrderRootCreateResult result) external;
}