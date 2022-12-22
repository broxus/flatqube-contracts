pragma ton-solidity >= 0.62.0;

import "../structures/IOrderRootCreateResult.sol";
import "../structures/IOrderExchangeResult.sol";
import "../structures/IOrderSwapResult.sol";

interface IOrderOperationCallback {
    function onOrderRootCreateSuccess(uint64 id, IOrderRootCreateResult.OrderRootCreateResult result) external;
    function onOrderRootCreateReject(uint64 id) external;
    function onOrderCreateOrderSuccess(uint64 id) external;
    function onOrderCreateOrderReject(uint64 id) external;
    function onOrderPartExchangeSuccess(uint64 id, address owner, IOrderExchangeResult.OrderExchangeResult result) external;
    function onOrderStateFilled(uint64 id, address owner, IOrderExchangeResult.OrderExchangeFilledResult result) external;
    function onOrderStateCancelled(uint64 id, IOrderExchangeResult.OrderExchangeCancelledResult result) external;
    function onOrderReject(uint64 id) external;
    function onOrderSwapSuccess(uint64 id, IOrderSwapResult.OrderSwapResult result) external;
    function onOrderSwapCancel(uint64 id) external;
}