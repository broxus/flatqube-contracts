pragma ton-solidity >= 0.62.0;

import "./ITokenOperationStructure.sol";

interface IWithdrawResultV2 is ITokenOperationStructure {
    struct WithdrawResultV2 {
        uint128 lp_amount;
        uint128[] old_balances;
        uint128[] amounts;
        uint128[] result_balances;
        uint128 invariant;
        uint128[] differences;
        bool[] sell;
        uint128[] pool_fees;
        uint128[] beneficiary_fees;
    }
}
