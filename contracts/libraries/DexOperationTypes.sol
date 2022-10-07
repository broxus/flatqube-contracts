pragma ton-solidity >= 0.57.0;

library DexOperationTypes {
    uint8 constant EXCHANGE = 1;
    uint8 constant DEPOSIT_LIQUIDITY = 2;
    uint8 constant WITHDRAW_LIQUIDITY = 3;
    uint8 constant CROSS_PAIR_EXCHANGE = 4;
    uint8 constant WITHDRAW_LIQUIDITY_ONE_COIN = 5;
    uint8 constant WITHDRAW_LIQUIDITY_V2 = 6;
    uint8 constant CROSS_PAIR_EXCHANGE_V2 = 7;
}
