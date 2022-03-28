pragma ton-solidity >= 0.57.0;

library LimitOrdersErrors {
    uint16 constant NOT_OWNER             = 300;
    uint16 constant NOT_PENDING_OWNER     = 301;
    uint16 constant VALUE_TOO_LOW         = 302;
    uint16 constant NOT_LIMITS_ORDER_ROOT = 303;
    uint16 constant NOT_TOKEN1_ROOT       = 304;
    uint16 constant NOT_TOKEN2_ROOT       = 305;
}
