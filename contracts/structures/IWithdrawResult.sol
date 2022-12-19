pragma ton-solidity >= 0.62.0;

// Deprecated
interface IWithdrawResult {
    struct WithdrawResult {
        uint128 lp;
        uint128 left;
        uint128 right;
    }
}
