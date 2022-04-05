pragma ton-solidity >= 0.57.0;

library LimitOrdersGas {
    uint128 constant TARGET_BALANCE                 = 1 ton;
    uint128 constant SET_CODE                       = 0.1 ton;
    uint128 constant DEPLOY_ORDERS_ROOT             = 2 ton;
    uint128 constant DEPLOY_ORDER_MIN_VALUE         = 3 ton;
    uint128 constant DEPLOY_EMPTY_WALLET_VALUE      = 0.2 ton;
    uint128 constant DEPLOY_EMPTY_WALLET_GRAMS      = 0.1 ton;
    uint128 constant SWAP_BACK_MIN_VALUE            = 3 ton;
    uint128 constant SWAP_MIN_VALUE                 = 5 ton;
}
