pragma ton-solidity >=0.62.0;

interface IOrderClosed {
	struct InitParams {
		address orderRoot;
		address factoryOrderRoot;
		address ownerAddress;
		address spentTokenRoot;
		address receiveTokenRoot;
	}

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

	event StateChanged(uint8 from, uint8 to, Details);

	function currentStatus() external view responsible returns(uint8);
	function initParams() external view responsible returns(InitParams);
	function getDetails() external view responsible returns(Details);
}
