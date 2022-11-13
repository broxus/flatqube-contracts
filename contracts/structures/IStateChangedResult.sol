pragma ton-solidity >= 0.57.0;

interface IStateChangedResult {
    struct Details {
		address orderRoot;
		address owner;
		uint64 swapAttempt;
		uint8 state;
		address spentToken;
		address receiveToken;
		address spentWallet;
		address receiveWallet;
		uint128 expectedAmount;
		uint128 initialAmount;
		uint128 currentAmountSpentToken;
	}

    struct StateChangedResult {
        uint8 from;
        uint8 to;
        Details details;
    }
}