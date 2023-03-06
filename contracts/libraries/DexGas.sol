pragma ever-solidity >= 0.62.0;

library DexGas {

    // ABSOLUTE

    uint128 constant ROOT_INITIAL_BALANCE               = 1 ever;
    uint128 constant ACCOUNT_INITIAL_BALANCE            = 1 ever;
    uint128 constant PAIR_INITIAL_BALANCE               = 1 ever;
    uint128 constant VAULT_INITIAL_BALANCE              = 1 ever;
    uint128 constant TOKEN_FACTORY_INITIAL_BALANCE      = 1 ever;
    uint128 constant TOKEN_ROOT_INITIAL_BALANCE         = 1 ever;

    uint128 constant DEPLOY_ACCOUNT_MIN_VALUE           = 2 ever;
    uint128 constant DEPLOY_POOL_BASE_VALUE             = 6 ever;
    uint128 constant DEPLOY_VAULT_MIN_VALUE             = 2.5 ever;
    uint128 constant DEPLOY_LP_TOKEN_ROOT_VALUE         = 5 ever;

    uint128 constant CREATE_TOKEN_VALUE                 = 3 ever;
//    uint128 constant TRANSFER_ROOT_OWNERSHIP_VALUE      = 0.5 ever;
    uint128 constant DEPLOY_TOKEN_ROOT_VALUE            = 2 ever;
    uint128 constant GET_TOKEN_DETAILS_VALUE            = 0.5 ever;
    uint128 constant GET_TOKEN_DECIMALS_VALUE           = 0.5 ever;

    uint128 constant PLATFORM_DEPLOY_VALUE              = 0.1 ever;
    uint128 constant SET_PLATFORM_CODE_VALUE            = 0.1 ever;
    uint128 constant SET_POOL_ACTIVE_VALUE              = 0.5 ever;

    uint128 constant ACCOUNT_INITIALIZE_VALUE           = 1 ever;
    uint128 constant PAIR_INITIALIZE_VALUE              = 1 ever;

    uint128 constant UPGRADE_ROOT_MIN_VALUE             = 3 ever;
    uint128 constant UPGRADE_ACCOUNT_MIN_VALUE          = 3 ever;
    uint128 constant UPGRADE_POOL_MIN_VALUE             = 3 ever;
    uint128 constant UPGRADE_VAULT_MIN_VALUE            = 5 ever;
    uint128 constant UPGRADE_TOKEN_VAULT_MIN_VALUE      = 3 ever;

    uint128 constant WITHDRAW_MIN_VALUE_BASE            = 1 ever;
    uint128 constant TRANSFER_MIN_VALUE                 = 1 ever;
    uint128 constant EXCHANGE_MIN_VALUE                 = 1 ever;
    uint128 constant DEPOSIT_LIQUIDITY_MIN_VALUE        = 1 ever;
    uint128 constant WITHDRAW_LIQUIDITY_MIN_VALUE       = 1 ever;
//    uint128 constant INTERNAL_PAIR_TRANSFER_VALUE       = 0.15 ever;

    uint128 constant DIRECT_PAIR_OP_MIN_VALUE           = 1.5 ever;
    uint128 constant DIRECT_PAIR_OP_MIN_VALUE_V2        = 2 ever;
    uint128 constant SUCCESS_CALLBACK_VALUE             = 0.1 ever;
    uint128 constant CROSS_POOL_EXCHANGE_MIN_VALUE      = 0.5 ever;

    uint128 constant VAULT_TRANSFER_BASE_VALUE          = 0.25 ever;
    uint128 constant VAULT_TRANSFER_BASE_VALUE_V2       = 0.5 ever;

    // TOKENS
    uint128 constant TRANSFER_TOKENS_VALUE              = 0.2 ever;
    uint128 constant DEPLOY_MINT_VALUE_BASE             = 0.5 ever;
//    uint128 constant BURN_VALUE                         = 0.1 ever;
    uint128 constant DEPLOY_EMPTY_WALLET_VALUE          = 0.5 ever;
    uint128 constant SEND_EXPECTED_WALLET_VALUE         = 0.1 ever;

    uint128 constant ADD_PAIR_MIN_VALUE                 = 3 ever;

    uint128 constant OPERATION_CALLBACK_BASE            = 0.01 ever;
//    uint128 constant SET_FEE_PARAMS_MIN_VALUE           = 1 ever;

//    uint128 constant REFERRER_FEE_EXTRA_VALUE           = 1 ever;
//    uint128 constant REFERRAL_PROGRAM_CALLBACK          = 0.2 ever;
    uint128 constant REFERRAL_PROGRAM_CALLBACK          = 200000;
    uint128 constant REFERRER_FEE_EXTRA_GAS             = 800000;
    uint128 constant REFERRAL_DEPLOY_EMPTY_WALLET_GRAMS = 0.05 ever;

    uint128 constant OPERATION_CALLBACK                 = 0.0101 ever;

    uint128 constant DEX_ACCOUNT_COMPENSATION           = 0.1 ever;
    uint128 constant DEX_TOKEN_VAULT_COMPENSATION       = 0.1 ever;
    uint128 constant DEX_POOL_COMPENSATION              = 0.1 ever;
    uint128 constant DEX_ROOT_COMPENSATION              = 0.1 ever;
    uint128 constant TOKEN_ROOT_COMPENSATION            = 0.1 ever;

    uint128 constant DEPLOY_EMPTY_WALLET_GRAMS          = 0.12 ever;
    uint128 constant DEPLOY_WALLET_EXTRA_GAS            = 100000;

    uint128 constant TRANSFER_TOKENS_VALUE              = 200000; // (fixed???)
    uint128 constant BURN_VALUE                         = 100000;
    uint128 constant INTERNAL_PAIR_TRANSFER_VALUE       = 100000;
    uint128 constant TOKEN_VAULT_TRANSFER               = 200000; // (prob +DEX_TOKEN_VAULT_COMPENSATION)

    uint128 constant MINT_TOKENS_EXTRA_GAS              = 100000;
    uint128 constant GET_TOKEN_DATA_EXTRA_GAS           =  50000;

    uint128 constant SET_FEE_PARAMS_EXTRA_GAS           = 100000;
    uint128 constant ADD_POOL_EXTRA_GAS                 = 150000;
    uint128 constant DEPLOY_TOKEN_VAULT_EXTRA_GAS       = 150000;
    uint128 constant DEPLOY_TOKEN_ROOT_EXTRA_GAS        =  20000;
    uint128 constant TRANSFER_ROOT_OWNERSHIP            =  20000;
    uint128 constant CREATE_TOKEN_EXTRA_GAS             =  50000;
    uint128 constant DEPLOY_LP_TOKEN_EXTRA_GAS          = 150000;
    uint128 constant DEPLOY_POOL_EXTRA_GAS              = 150000;
    uint128 constant DEPLOY_ACCOUNT_EXTRA_GAS           = 150000;

    uint128 constant ACCOUNT_WITHDRAW_EXTRA_GAS         = 150000;
    uint128 constant ACCOUNT_TRANSFER_EXTRA_GAS         = 150000;
    uint128 constant ACCOUNT_EXCHANGE_EXTRA_GAS         = 300000;
    uint128 constant ACCOUNT_DEPOSIT_EXTRA_GAS          = 400000;
    uint128 constant ACCOUNT_WITHDRAW_LP_EXTRA_GAS      = 400000;

    uint128 constant DIRECT_EXCHANGE_EXTRA_GAS          = 400000;
    uint128 constant DIRECT_DEPOSIT_EXTRA_GAS           = 400000;
    uint128 constant DIRECT_WITHDRAW_EXTRA_GAS          = 400000;
    uint128 constant DIRECT_WITHDRAW_EXTRA_GAS          = 400000;
    uint128 constant CROSS_EXCHANGE_STEP_EXTRA_GAS      = 300000;
}
