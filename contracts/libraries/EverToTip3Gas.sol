pragma ton-solidity >= 0.62.0;

library EverToTip3Gas {
    uint128 constant TARGET_BALANCE                     = 1 ever;

    uint128 constant OPERATION_CALLBACK_BASE            = 0.01 ever;
    uint128 constant MINT_DEPLOY_EMPTY_WALLET_GRAMS     = 0.1 ever;

    // comment out later
    uint128 constant DEPLOY_EMPTY_WALLET_VALUE      = 0.5 ever;
//    uint128 constant DEPLOY_EMPTY_WALLET_GRAMS      = 0.1 ever;
    uint128 constant SWAP_TIP3_TO_EVER_MIN_VALUE    = 3 ever;
    uint128 constant SWAP_EVER_TO_TIP3_MIN_VALUE    = 4 ever;

    uint128 constant EVER_WEVER_TIP3_COMPENSATION       = 0.1 ever;
    uint128 constant TOKEN_ROOT_COMPENSATION            = 0.1 ever;
    uint128 constant DEPLOY_EMPTY_WALLET_GRAMS          = 0.12 ever;
    uint128 constant DEPLOY_WALLET_EXTRA_GAS            = 100000;

    uint128 constant EVER_TIP3_SWAP_FIRST_STEP          = 200000;
    uint128 constant EVER_TIP3_CROSS_SWAP_FIRST_STEP    = 300000;
    uint128 constant EVER_WEVER_EXTRA_GAS_FIRST_STEP    = 300000;
    uint128 constant EVER_WEVER_TIP3_LAST_STEP          = 150000;
}
