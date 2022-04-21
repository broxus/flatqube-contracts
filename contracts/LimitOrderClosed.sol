pragma ton-solidity >=0.57.0;

import "./libraries/LimitOrderGas.sol";
import "./libraries/LimitOrderStatus.sol";
import "./libraries/LimitOrderErrors.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";

contract LimitOrderClosed is IAcceptTokensTransferCallback{
	uint64 static timeTx;
	uint64 static nowTx;
	address static factoryOrderRoot;
	address static limitOrdersRoot;
	address static ownerAddress;
	address static spentTokenRoot;
	address static receiveTokenRoot;

	uint128 expectedAmount;
	uint128 initialAmount;

	uint128 currentAmountSpentToken;
	uint128 currentAmountReceiveToken;

	uint256 backendPubKey;
	address dexRoot;
	address dexPair;

	address spentWallet;
	address receiveWallet;

	uint8 state;

	uint64 swapAttempt;

	constructor() public {
		revert();
	}

	modifier onlyLimitOrderFactory() {
		require(
			msg.sender.value != 0 && msg.sender == factoryOrderRoot,
			LimitOrderErrors.NOT_FACTORY_LIMIT_ORDERS_ROOT
		);
		_;
	}

	function onAcceptTokensTransfer(
		address, /*tokenRoot*/
		uint128 amount,
		address sender,
		address, /*senderWallet*/
		address originalGasTo,
		TvmCell /*payload*/
	) external override {
		tvm.rawReserve(
			math.max(
				LimitOrderGas.TARGET_BALANCE,
				address(this).balance - msg.value
			),
			0
		);
		TvmCell emptyPayload;
		ITokenWallet(msg.sender).transfer{
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED,
			bounce: false
		}(amount, sender, uint128(0), originalGasTo, true, emptyPayload);
	}

	function upgrade(TvmCell newCode) internal onlyLimitOrderFactory {
		tvm.setcode(newCode);
		tvm.setCurrentCode(newCode);

		TvmCell data = abi.encode(
			state,
			spentWallet,
			ownerAddress,

			timeTx,
			nowTx,
			factoryOrderRoot,
			limitOrdersRoot,
			currentAmountSpentToken,
			
			spentTokenRoot,
			receiveTokenRoot,
			expectedAmount,
			initialAmount,
			currentAmountReceiveToken,
			backendPubKey,
			dexRoot,
			dexPair,
			receiveWallet,
			swapAttempt
		);

		onCodeUpgrade(data);
	}

	function onCodeUpgrade(TvmCell data) private {
		(
			uint8 state_,
			address spentWallet_,
			address ownerAddress_, 
			uint128 currentAmountSpentToken_ 
		) = abi.decode(
				data,
				(uint8,
				address,
				address,
				uint128)
			);

		if (state_ == LimitOrderStatus.Cancelled) {
			TvmCell emptyPayload;
			ITokenWallet(spentWallet_).transfer{
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED,
				bounce: false
			}(
				currentAmountSpentToken_,
				ownerAddress_, 
				0, 
				ownerAddress_,
				true, 
				emptyPayload
			);
		} else {
			ownerAddress_.transfer({
		    value: 0,
		    flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
		    bounce: false
		});	
		}
	}
}
