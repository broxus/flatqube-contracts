pragma ton-solidity >= 0.57.0;

interface IOrderExchangeResult {
    struct OrderExchangeResult {
        address spentToken;
		uint128 spentAmount;
		address receiveToken;
		uint128 receiveAmount;
		uint128 currentSpentTokenAmount;
		uint128 currentReceiveTokenAmount;
    }

	struct OrderExchangeFilledResult {
		address spentToken;
		uint128 spentAmount;
		address receiveToken;
		uint128 receiveAmount;
	}

	struct OrderExchangeCancelledResult {
		address spentToken;
		uint128 currentSpentTokenAmount;
	}
}