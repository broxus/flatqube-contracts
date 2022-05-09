pragma ton-solidity >= 0.57.0;

library LimitOrderErrors {
    uint16 constant NOT_OWNER                               = 300;
    uint16 constant NOT_PENDING_OWNER                       = 301;
    uint16 constant VALUE_TOO_LOW                           = 302;
    uint16 constant EMPTY_SALT_IN_ORDER                     = 303;
    uint16 constant NOT_BEGIN_DATA                          = 304;
    uint16 constant NOT_LIMITS_ORDER_OWNER                  = 305;
    uint16 constant NOT_WALLET_TOKEN_2                      = 306;
    uint16 constant NOT_ACTIVE_LIMIT_ORDER                  = 307;
    uint16 constant NOT_BACKEND_PUB_KEY                     = 308;
    uint16 constant NOT_FILLED_OR_CANCEL_STATUS_LIMIT_OEDER = 309;
    uint16 constant NOT_TOKEN1_ROOT                         = 310;
    uint16 constant NOT_TOKEN2_ROOT                         = 311;
    uint16 constant NOT_FACTORY_LIMIT_ORDERS_ROOT           = 312;
    uint16 constant NOT_LIMIT_ORDER_ROOT                    = 313;
}
