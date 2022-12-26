pragma ton-solidity >= 0.62.0;

interface IOrderWithdrawalFeeParams {
    struct OrderWithdrawalFeeParams {
        uint64 call_id;
        address recipient;
        uint128 amount;
        address rm_gas_to;
    }
}
