pragma ton-solidity >= 0.57.0;

interface IExchangeResultV2 {
    struct ExchangeResultV2 {
        address spent_token;
        address received_token;
        uint128 spent;
        uint128 fee;
        uint128 received;
    }
}
