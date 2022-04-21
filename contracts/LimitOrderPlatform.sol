pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

contract LimitOrderPlatform {
	address static factoryLimitOrder;
	uint8 static typeId;
	TvmCell static params;

	constructor(
		// TvmCell code, // ???
		// uint32 version, // ???
		// address sendGasTo // ???
	) public {
		// TvmBuilder builder;
		// ///?????????????

		// onCodeUpgrade(builder.toCell());
	}

	function onCodeUpgrade(TvmCell data) private {}
}
