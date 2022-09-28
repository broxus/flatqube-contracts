pragma ton-solidity >=0.57.0;

interface IOrder {
	struct InitParams {
		address factory;
		address root;
		address owner;
		address spentToken;
		address receiveToken;
		uint64 timeTx;
		uint64 nowTx;
	}

	struct Details {
		address root;
		address owner;
		uint256 backPK;
		address dexRoot;
		address dexPair;
		address msgSender;
		uint64 swapAttempt;
		uint8 state;
		address spentToken;
		address receiveToken;
		address spentWallet;
		address receiveWallet;
		uint128 expectedAmount;
		uint128 initialAmount;
		uint128 currentAmountSpentToken;
		uint128 currentAmountReceiveToken;
	}

	event StateChanged(uint8 from, uint8 to, Details);
	event PartExchange(
		address spentToken,
		uint128 spentAmount,
		address receiveToken,
		uint128 receiveAmount,
		uint128 currentSpentTokenAmount,
		uint128 currentReceiveTokenAmount
	);

	function currentStatus() external view responsible returns(uint8);
	function initParams() external view responsible returns (InitParams);
	function getDetails() external view responsible returns (Details);	
}
