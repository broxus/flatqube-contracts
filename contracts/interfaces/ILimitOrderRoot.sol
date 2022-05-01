pragma ton-solidity >=0.57.0;

interface ILimitOrderRoot {
	event CreateLimitOrder(
		address limitOrder,
		address spentTokenRoot,
		uint128 spentAmount,
		address receiveTokenRoot,
		uint128 expectedAmount
	);

	function getSpentTokenRoot() external view responsible returns (address);

	function getFactoryAddress() external view responsible returns (address);

	function expectedAddressLimitOrder(
		address limitOrderRoot,
		address limitOrderFactory,
		address owner,
		address spentTokenRoot,
		address receiveTokenRoot,
		uint64 timeTx,
		uint64 nowTx
	) external view responsible returns (address);
}
