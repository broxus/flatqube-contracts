pragma ton-solidity >= 0.57.0;

interface IExchangeStepStructure {
    struct ExchangeStep {
        uint128 amount;
        address[] roots;
        address outcoming;
    }
}
