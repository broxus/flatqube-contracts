pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/OrderGas.sol";
import "./libraries/OrderErrors.sol";
import "./interfaces/IOrderFactory.sol";
import "./interfaces/IOrderRoot.sol";
import "./interfaces/IHasEmergencyMode.sol";

import "./OrderPlatform.sol";
import "./OrderRoot.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

contract OrderFactory is IOrderFactory {
	uint32 static randomNonce;
	address static dexRoot;

	uint32 currentVersion;
	uint32 versionOrderRoot;
	uint32 versionOrder;
	uint32 versionOrderClosed;

	address owner;
	address pendingOwner;
	
	TvmCell orderRootCode;
	TvmCell orderPlatformCode;
	TvmCell orderCode;
	TvmCell orderClosedCode;
	
	constructor(address _owner, uint32 _version) public {
		require(_owner.value != 0);
		tvm.accept();
		tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);

		currentVersion = _version;
		owner = _owner;
		owner.transfer({
			value: 0,
			bounce: false,
			flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		});
	}

	modifier onlyOwner() {
		require(
			msg.sender.value != 0 && msg.sender == owner,
			OrderErrors.NOT_OWNER
		);
		_;
	}

	function onOrderRootDeployed(
		address _orderRoot,
		address token,
		address sendGasTo
	) external override {
		require(
			msg.sender.value != 0 && msg.sender == expectedAddressOrderRoot(token), 
			OrderErrors.NOT_LIMIT_ORDER_ROOT
		);
		tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);
		emit CreateOrderRoot(_orderRoot, token);
		
		sendGasTo.transfer({
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		});
	}

	function transferOwner(address newOwner) external responsible onlyOwner returns (address) {
		pendingOwner = newOwner;
		emit RequestedOwnerTransfer(owner, pendingOwner);
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pendingOwner;
	}

	function acceptOwner() external responsible returns (address) {
		require(
			msg.sender.value != 0 && msg.sender == pendingOwner,
			OrderErrors.NOT_PENDING_OWNER
		);
		emit OwnerTransferAccepted(owner, pendingOwner);
		owner = pendingOwner;
		pendingOwner = address(0);

		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } owner;
	}

	function getOwner() external view responsible returns (address) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } owner;
	}

	function getPendingOwner() external view responsible returns (address) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pendingOwner;
	}

	function getVersion() external view responsible returns (uint32) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } currentVersion;
	}

	function getVersionRoot() external view responsible returns (uint32) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } versionOrderRoot;
	}

	function getVersionOrder() external view responsible returns (uint32) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } versionOrder;
	}

	function getVersionOrderClosed() external view responsible returns (uint32) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } versionOrderClosed;
	}

	function codeOrderRoot() external view responsible returns (TvmCell) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } orderRootCode;
	}

	function codeOrder() external view responsible returns (TvmCell) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } orderCode;
	}

	function codeOrderClosed() external view responsible returns (TvmCell) {
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } orderClosedCode;
	}

	function setEmergency(
		bool enabled, 
		address orderAddress,
		uint256 manager
	) external view onlyOwner {
		require(msg.value >= OrderGas.MANAGE_EMERGENCY_MODE_MIN_VALUE, OrderErrors.VALUE_TOO_LOW);
		tvm.rawReserve(address(this).balance - msg.value, 0);
		if (enabled) {
			IHasEmergencyMode(orderAddress).enableEmergency{
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED,
				bounce: false
			}(manager);
		} else {
			IHasEmergencyMode(orderAddress).disableEmergency{
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED,
				bounce: false
			}();
		}	
	}

	function upgradeOrderRoot(address orderAddress) external view onlyOwner {
		require(msg.value >= OrderGas.UPDATE_ORDER_ROOT, OrderErrors.VALUE_TOO_LOW);
		tvm.rawReserve(address(this).balance - msg.value, 0);
		IOrderRoot(orderAddress).upgrade{
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED,
			bounce: false
		}(orderRootCode, versionOrderRoot, address(this));
	}

	function setPlatformCodeOnce(TvmCell _orderPlatform) public onlyOwner {
		require(orderPlatformCode.toSlice().empty(), OrderErrors.PLATFORM_CODE_NON_EMPTY);
		tvm.rawReserve(OrderGas.SET_CODE, 0);
		orderPlatformCode = _orderPlatform;

		emit PlatformCodeUpgraded();
		owner.transfer(
			0,
			false,
			MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		);
	}

	function setOrderRootCode(TvmCell _orderRootCode) public onlyOwner {
		tvm.rawReserve(OrderGas.SET_CODE, 0);
		uint32 prevVersion = versionOrderRoot;
		versionOrderRoot++;
		orderRootCode = _orderRootCode;

		emit OrderRootCodeUpgraded(prevVersion, versionOrderRoot);

		msg.sender.transfer(
			0,
			false,
			MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		);
	}

	function setOrderCode(TvmCell _orderCode) public onlyOwner {
		tvm.rawReserve(OrderGas.SET_CODE, 0);
		uint32 prevVersion = versionOrder;
		versionOrder++;
		orderCode = _orderCode;

		emit OrderCodeUpgraded(prevVersion, versionOrder);

		msg.sender.transfer(
			0,
			false,
			MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		);
	}

	function setOrderClosedCode(TvmCell _orderClosedCode) public onlyOwner {
		tvm.rawReserve(OrderGas.SET_CODE, 0);
		uint32 prevVersion = versionOrderClosed;
		versionOrderClosed++;
		orderClosedCode = _orderClosedCode;

		emit OrderClosedCodeUpgraded(prevVersion, versionOrderClosed);

		msg.sender.transfer(
			0,
			false,
			MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
		);
	}

	function createOrderRoot(address token, uint64 callbackId) override external view {
		require(
			msg.value >= OrderGas.DEPLOY_ORDERS_ROOT,
			OrderErrors.VALUE_TOO_LOW
		);
		tvm.rawReserve(OrderGas.DEPLOY_ORDERS_ROOT, 0);

		new OrderPlatform {
			stateInit: buildState(token, buildCode(token), buildParams()),
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED 
		}(
			orderRootCode,
			versionOrderRoot,
			msg.sender,
			callbackId
		);
	}

	function getExpectedAddressOrderRoot(address token)
		override
		external
		view
		responsible
		returns (address)
	{
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } expectedAddressOrderRoot(token);
	}


	function expectedAddressOrderRoot(address token) internal view returns(address) {
		return address(tvm.hash(buildState(token, buildCode(token), buildParams())));
	}

	function buildCode(
		address token
	) internal view returns (TvmCell) {
		TvmBuilder salt;
		salt.store(owner);
		salt.store(token);

		return tvm.setCodeSalt(orderPlatformCode, salt.toCell());
	}

	function buildState(address token, TvmCell _code, TvmCell params) internal pure returns (TvmCell) {
		return tvm.buildStateInit({
            contr: OrderPlatform,
            varInit: {
				factory: address(this),
				spentToken: token,
				params: params
            },
            pubkey: 0,
            code: _code
        });
	}

	function buildParams() internal view returns (TvmCell) {
		return abi.encode(dexRoot, orderCode, orderClosedCode);
	}

	function upgrade(
		TvmCell newCode,
		uint32 newVersion,
		address sendGasTo
	) external override onlyOwner {
		if (currentVersion == newVersion) {
			tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);
			sendGasTo.transfer({
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
				bounce: false
			});
		} else {
			emit OrderFactoryUpgrade(currentVersion, newVersion);

			TvmBuilder builder;
			builder.store(currentVersion);
			builder.store(newVersion);
			builder.store(versionOrderRoot);
			builder.store(owner);
			builder.store(pendingOwner);
			builder.store(dexRoot);
			builder.store(orderRootCode);
			builder.store(orderCode);
			builder.store(orderClosedCode);
			builder.store(orderPlatformCode);

			tvm.setcode(newCode);
			tvm.setCurrentCode(newCode);

			onCodeUpgrade(builder.toCell());
		}
	}

	function onCodeUpgrade(TvmCell data) private {}
}
