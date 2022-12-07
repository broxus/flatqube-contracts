pragma ton-solidity >= 0.62.0;

interface INextExchangeData {
    struct NextExchangeData {
        uint128 numerator;
        address poolRoot;
        TvmCell payload;
        uint32 nestedNodes;
        uint32 leaves;
    }
}
