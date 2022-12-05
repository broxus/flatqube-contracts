pragma ton-solidity >= 0.57.0;

import "../structures/IPartExchangeResult.sol";
import "../structures/IStateChangedResult.sol";
import "../structures/ISwapResult.sol";
import "../structures/ICreateOrderRootResult.sol";
import "../structures/ICreateOrderResult.sol";


interface IOrderOperationCallback {
    function orderPartExchangeSuccess(uint64 id, bool via_account, IPartExchangeResult.PartExchangeResult result) external;
    function orderStateChangedSuccess(optional(uint64) id, bool via_account, IStateChangedResult.StateChangedResult result) external;
    function orderSwapSuccess(uint64 id, bool via_account, ISwapResult.SwapResult result) external;
    function orderCreateOrderSuccess(uint64 id, bool via_account, ICreateOrderResult.CreateOrderResult result) external;
}