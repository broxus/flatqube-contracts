pragma ton-solidity >=0.62.0;

import "../structures/IOrderFeeParams.sol";
import "../structures/IOrderWithdrawalFeeParams.sol";


interface IOrderRoot is IOrderFeeParams, IOrderWithdrawalFeeParams {
	event CreateOrder(
		address order,
		address spentToken,
		uint128 spentAmount,
		address receiveToken,
		uint128 expectedAmount
	);
	event OrderRootCodeUpgraded(uint32 newVersion);

	function getVersion() external view responsible returns(uint32);
	function getSpentToken() external view responsible returns (address);
	function getFactory() external view responsible returns (address);
	function getFeeParams() external view responsible returns (OrderFeeParams, address);
	function setFeeParams(OrderFeeParams params) external;
	function setBeneficiary(address beneficiary_) external;
	function withdrawFee(uint128 amount, address recipient, address tokenRoot, address rm_gas_to) external;


	function expectedAddressOrder(
		address root,
		address factory,
		address owner,
		address spentToken,
		address receiveToken,
		uint64 timeTx,
		uint64 nowTx
	) external view responsible returns (address);
	function upgrade(TvmCell _code, uint32 _newVersion, address _sendGasTo) external;
}
