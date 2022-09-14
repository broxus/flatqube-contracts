pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

contract LimitOrderPlatform {
	address static spenTokenRoot;
	address static factoryLimitOrder;
	TvmCell static params;

	constructor(
		TvmCell code,
		uint32 version,
		address sendGasTo
	) public {
		if (msg.sender == factoryLimitOrder) {
			initialize(code, version, sendGasTo);
		} else {
			sendGasTo.transfer({
				velue: 0,
				flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO,
				bounce: false
			});
		}
	}

	function initialize(
		TvmCell code,
		uint32 version,
		address sendGasTo
	) private {
		tvm.setcode(code);
		tvm.setCurrentCode(code);

		onCodeUpgrade(
			abi.encode(
				spentTokenRoot,
				factoryLimitOrder,
				uint32(0),
				version,
				sendGasTo,
				tvm.code,
				params
			)
		);
	}

	function onCodeUpgrade(TvmCell data) private {}
}
