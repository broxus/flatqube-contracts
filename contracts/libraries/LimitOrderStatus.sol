pragma ton-solidity >= 0.57.0;

library LimitOrderStatus {
    uint8 constant Initialize     = 0;
    uint8 constant AwaitTokens    = 1;
    uint8 constant Active         = 2;
    uint8 constant Filled         = 3;
    uint8 constant SwapInProgress = 4;
    uint8 constant Cancelled      = 5;
    uint8 constant Emergency      = 6;
}