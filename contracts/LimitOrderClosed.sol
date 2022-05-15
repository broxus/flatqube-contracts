pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrderGas.sol";
import "./libraries/LimitOrderStatus.sol";
import "./libraries/LimitOrderErrors.sol";

import "./interfaces/ILimitOrderClosed.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";

contract LimitOrderClosed is IAcceptTokensTransferCallback, ILimitOrderClosed{
	address static factoryOrderRoot;
	address static limitOrderRoot;
	address static ownerAddress;
	address static spentTokenRoot;
	address static receiveTokenRoot;

	uint128 expectedAmount;
	uint128 initialAmount;

	uint128 currentAmountSpentToken;

	address spentWallet;
	address receiveWallet;

	uint8 state;

	uint64 swapAttempt;

	function getCurrentStatus() override external view responsible returns(uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } state;
    }

    function getInitParams() override external view responsible returns(LimitOrderClosedInitParams){
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } LimitOrderClosedInitParams(
            limitOrderRoot,
            factoryOrderRoot,
            ownerAddress,
            spentTokenRoot,
            receiveTokenRoot
        );
    }

    function getDetails() override external view responsible returns(LimitOrderClosedDetails){
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } builderDetails();
    }

	modifier onlyLimitOrderFactory() {
		require(
			msg.sender.value != 0 && msg.sender == factoryOrderRoot,
			LimitOrderErrors.NOT_FACTORY_LIMIT_ORDER_ROOT
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
		tvm.rawReserve(math.max(LimitOrderGas.TARGET_BALANCE, address(this).balance - msg.value	), 0);
		TvmCell emptyPayload;
		ITokenWallet(msg.sender).transfer{
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED,
			bounce: false
		}(
			amount,
			sender, 
			uint128(0), 
			originalGasTo, 
			true, 
			emptyPayload
		);
	}

	function builderDetails() private view returns(LimitOrderClosedDetails){
        return LimitOrderClosedDetails(
            limitOrderRoot,
            ownerAddress,
            swapAttempt,

            state,

            spentTokenRoot,
            receiveTokenRoot,

            spentWallet,
            receiveWallet,

            expectedAmount,
            initialAmount,

			currentAmountSpentToken
        );
    }

	function upgrade(TvmCell newCode) internal onlyLimitOrderFactory { //?
		tvm.setcode(newCode);
		tvm.setCurrentCode(newCode);

		TvmBuilder builderUpg;
        builderUpg.store(state);
        builderUpg.store(ownerAddress);
        builderUpg.store(factoryOrderRoot);
        builderUpg.store(limitOrderRoot);
        builderUpg.store(swapAttempt);

        TvmBuilder builderTokens;
        builderTokens.store(spentWallet);
        builderTokens.store(currentAmountSpentToken);
        builderTokens.store(spentTokenRoot);
        builderTokens.store(receiveTokenRoot);
        builderUpg.storeRef(builderTokens);

        TvmBuilder builderSum;
        builderSum.store(expectedAmount);
        builderSum.store(initialAmount);
        builderSum.store(receiveWallet);
        builderUpg.storeRef(builderSum);

        onCodeUpgrade(builderUpg.toCell());
	}

	function onCodeUpgrade(TvmCell data) private {

		tvm.resetStorage();
		TvmSlice upg = data.toSlice();
	
		(
			uint8 state_, 
			address ownerAddress_,
			address factoryOrderRoot_,
			address limitOrderRoot_,
			uint64 swapAttempt_
		) = upg.decode(uint8, address, address, address, uint64);

		state = state_;
		ownerAddress = ownerAddress_;
		factoryOrderRoot = factoryOrderRoot_;
		limitOrderRoot = limitOrderRoot_;
		swapAttempt = swapAttempt_;

		TvmSlice dataTokens = upg.loadRefAsSlice();
		(
			address spentWallet_, 
			uint128 currentAmountSpentToken_,
			address spentTokenRoot_,
			address receiveTokenRoot_
		) = dataTokens.decode(address, uint128, address, address);

		spentWallet = spentWallet_;
		currentAmountSpentToken = currentAmountSpentToken_;
		spentTokenRoot = spentTokenRoot_;
		receiveTokenRoot = receiveTokenRoot_;

		TvmSlice dataSum = upg.loadRefAsSlice();
		(
			uint128 expectedAmount_,
			uint128 initialAmount_,
			address receiveWallet_
		) = dataSum.decode(uint128, uint128, address);

		expectedAmount = expectedAmount_;
		initialAmount = initialAmount_;
		receiveWallet = receiveWallet_;

		if (state == LimitOrderStatus.Cancelled) {
			TvmCell emptyPayload;
			ITokenWallet(spentWallet).transfer{
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED,
				bounce: false
			}(
				currentAmountSpentToken,
				ownerAddress, 
				0, 
				ownerAddress,
				true, 
				emptyPayload
			);
		} else {
			ownerAddress.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
		}
	}
}
