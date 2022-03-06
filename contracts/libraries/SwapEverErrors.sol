pragma ton-solidity >= 0.57.0;

library SwapEverErrors {
    uint16 constant NOT_ROOT_WEVER             = 100;
    uint16 constant NOT_WALLET_WEVER           = 101;
    uint16 constant INVALID_CALLBACK           = 102;
    uint16 constant VALUE_TOO_LOW              = 103;
    uint16 constant UNKNOWN_OPERATION_STATUS   = 104;
    uint16 constant UNAVAILABLE_OPERATION_TYPE = 105;
}