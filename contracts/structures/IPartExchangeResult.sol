pragma ton-solidity >= 0.57.0;

interface IPartExchangeResult {
    struct PartExchangeResult {
        address spentToken;
		uint128 spentAmount;
		address receiveToken;
		uint128 receiveAmount;
		uint128 currentSpentTokenAmount;
		uint128 currentReceiveTokenAmount;
    }
}