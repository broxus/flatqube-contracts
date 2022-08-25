pragma ton-solidity >= 0.57.0;

import "./ITokenOperationStructure.sol";

interface IWithdrawResultV2 is ITokenOperationStructure {
    struct WithdrawResultV2 {
        uint128 lp_amount;
        TokenOperation[] operations;
    }
}
