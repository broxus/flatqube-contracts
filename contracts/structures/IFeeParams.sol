pragma ton-solidity >= 0.57.0;

interface IFeeParams {
    struct FeeParams {
        uint128 denominator;
        uint128 pool_numerator;
        uint128 beneficiary_numerator;
        address beneficiary;
        mapping(address => uint128) threshold;
    }
}
