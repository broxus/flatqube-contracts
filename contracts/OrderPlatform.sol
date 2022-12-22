pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "./structures/IOrderFeeParams.sol";

contract OrderPlatform is IOrderFeeParams{
	address static factory;
	address static spentToken;
	TvmCell static params;



	constructor(
		TvmCell code,
		uint32 version,
		address sendGasTo,
		uint64 callbackId

	) public {
		if (msg.sender.value != 0 && msg.sender == factory) {
			initialize(code, version, sendGasTo, callbackId);
		} else {
			sendGasTo.transfer({
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO,
				bounce: false
			});
		}
	}

	function initialize(
		TvmCell code,
		uint32 version,
		address sendGasTo,
		uint64  callbackId
	) private {

		TvmBuilder builder;
		builder.store(factory);
		builder.store(spentToken);
		builder.store(uint32(0));
		builder.store(version);
		builder.store(sendGasTo);
		builder.store(callbackId);
		builder.store(params);


		
		tvm.setcode(code);
		tvm.setCurrentCode(code);

		onCodeUpgrade(builder.toCell());
	}

	function onCodeUpgrade(TvmCell data) private {}
}
