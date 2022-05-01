pragma ton-solidity >=0.57.0;

interface ILimitOrder {
	struct LimitOrderInitParams {
		address limitOrdersRoot;
		address factoryOrderRoot;
		address ownerAddress;
		address spentTokenRoot;
		address receiveTokenRoot;
		uint64 timeTx;
		uint64 nowTx;
	}

	struct LimitOrderDetails {
		address limitOrdersRoot;
		address ownerAddress;
		uint256 backendPubKey;
		address dexRoot;
		address dexPair;
		address msgSender;
		uint64 swapAttempt;
		uint8 state;
		address spentTokenRoot;
		address receiveTokenRoot;
		address spentWallet;
		address receiveWallet;
		uint128 expectedAmount;
		uint128 initialAmount;
		uint128 currentAmountSpentToken;
		uint128 currentAmountReceiveToken;
	}

	event LimitOrderStateChanged(uint8 from, uint8 to, LimitOrderDetails);
	event LimitOrderPartExchange(
		address spentTokenRoot,
		uint128 spentAmount,
		address receiveTokenRoot,
		uint128 receiveAmount,
		uint128 currentSpentTokenAmount,
		uint128 currentReceiveTokenAmount
	);

	function getInitParams()
		external
		view
		responsible
		returns (LimitOrderInitParams);
}
