pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/OrderGas.sol";
import "./libraries/OrderErrors.sol";
import "./libraries/OrderStatus.sol";
import "./libraries/OrderOperationStatus.sol";
import "./libraries/DexOperationTypes.sol";

import "./interfaces/IOrder.sol";
import "./interfaces/IHasEmergencyMode.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IOrderOperationCallback.sol";


import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/TIP3TokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract Order is
	IAcceptTokensTransferCallback,
	IOrder,
	IHasEmergencyMode
{
	address static factory;
	address static root;
	address static owner;
	address static spentToken;
	address static receiveToken;
	uint64 static timeTx;
	uint64 static nowTx;

	uint128 expectedAmount;
	uint128 initialAmount;

	uint128 currentAmountSpentToken;
	uint128 currentAmountReceiveToken;

	uint256 backPK;
	address dexRoot;
	address dexPair;

	address spentWallet;
	address receiveWallet;

	TvmCell codeClosed;

	uint8 state;
	uint64 swapAttempt;

	uint8 prevState;
	uint256 emergencyManager;

	bool autoExchange;

	constructor(
		uint128 _expectedAmount,
		uint128 _initialAmount,
		uint256 _backPK,
		address _dexRoot,
		TvmCell _codeClosed
	) public {
		changeState(OrderStatus.Initialize);
		optional(TvmCell) optSalt = tvm.codeSalt(tvm.code());
		require(optSalt.hasValue(), OrderErrors.EMPTY_SALT_IN_ORDER);
		(address rootSalt, address tokenRootSalt) = optSalt
			.get()
			.toSlice()
			.decode(address, address);

		if (
			rootSalt == root &&
			tokenRootSalt == receiveToken &&
			msg.sender.value != 0 &&
			msg.sender == root
		) {
			tvm.rawReserve(address(this).balance - msg.value, 0);

			currentAmountReceiveToken = expectedAmount = _expectedAmount;
			currentAmountSpentToken = initialAmount = _initialAmount;
			backPK = _backPK;
			dexRoot = _dexRoot;
			codeClosed = _codeClosed;

			IDexRoot(dexRoot).getExpectedPairAddress{
				value: OrderGas.GET_DEX_PAIR,
				flag: MsgFlag.SENDER_PAYS_FEES,
				callback: Order.onBeginData
			}(spentToken, receiveToken);

			ITokenRoot(spentToken).deployWallet{
				value: OrderGas.DEPLOY_EMPTY_WALLET_VALUE,
				flag: MsgFlag.SENDER_PAYS_FEES,
				callback: Order.onBeginData
			}(address(this), OrderGas.DEPLOY_EMPTY_WALLET_GRAMS);

			ITokenRoot(receiveToken).deployWallet{
				value: OrderGas.DEPLOY_EMPTY_WALLET_VALUE,
				flag: MsgFlag.SENDER_PAYS_FEES,
				callback: Order.onBeginData
			}(address(this), OrderGas.DEPLOY_EMPTY_WALLET_GRAMS);
		} else {
			msg.sender.transfer(
				0,
				false,
				MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
			);
		}
	}

	modifier onlyFactory() {
		require(
			msg.sender.value != 0 && msg.sender == factory,
			OrderErrors.NOT_FACTORY_LIMIT_ORDER_ROOT
		);
		_;
	}

	modifier onlyOwner() {
		require(
			(msg.sender.value != 0 && msg.sender == owner),
			OrderErrors.NOT_LIMIT_ORDER_OWNER
		);
		_;
	}

	modifier onlyEmergencyManager() {
		require(
			emergencyManager != 0 &&
				((msg.sender.value != 0 &&
					msg.sender.value == emergencyManager) ||
					msg.pubkey() == emergencyManager),
			OrderErrors.NOT_EMERGENCY_MANAGER
		);
		_;
	}

	function onBeginData(address inAddress) external {
		require(
			msg.sender.value != 0 &&
				(msg.sender == dexRoot ||
					msg.sender == spentToken ||
					msg.sender == receiveToken),
			OrderErrors.NOT_BEGIN_DATA
		);

		if (msg.sender == dexRoot) {
			dexPair = inAddress;
			autoExchange = true;
		} else if (msg.sender == spentToken) {
			spentWallet = inAddress;
		} else if (msg.sender == receiveToken) {
			receiveWallet = inAddress;
		}

		if (
			spentWallet.value != 0 &&
			receiveWallet.value != 0
		) {
			TIP3TokenWallet(receiveWallet).balance{
				value: OrderGas.GET_BALANCE_WALLET,
				flag: MsgFlag.SENDER_PAYS_FEES,
				callback: Order.onBalanceReceiveWallet
			}();
		}
	}

	function onBalanceReceiveWallet(uint128 _balance) external {
		require(
			msg.sender.value != 0 && msg.sender == receiveWallet,
			OrderErrors.NOT_WALLET_TOKEN_2
		);

		if (state != OrderStatus.Active) {
			if (_balance >= expectedAmount) {
				changeState(OrderStatus.Active);
			} else {
				changeState(OrderStatus.AwaitTokens);
			}
		}
	}

	function currentStatus()
		external
		view
		responsible
		override
		returns (uint8)
	{
		return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } state;
	}

	function initParams()
		external
		view
		responsible
		override
		returns (InitParams)
	{
		return
			{
				value: 0,
				bounce: false,
				flag: MsgFlag.REMAINING_GAS
			} InitParams(
				factory,
				root,
				owner,
				spentToken,
				receiveToken,
				timeTx,
				nowTx
			);
	}

	function getDetails()
		external
		view
		responsible
		override
		returns (Details)
	{
		return
			{
				value: 0,
				bounce: false,
				flag: MsgFlag.REMAINING_GAS
			} buildDetails();
	}

	function buildPayload(uint128 deployWalletValue)
		external
		pure
		returns (TvmCell)
	{
		TvmBuilder builder;
		builder.store(deployWalletValue);
		return builder.toCell();
	}

	function onAcceptTokensTransfer(
		address tokenRoot,
		uint128 amount,
		address sender,
		address, /*senderWallet*/
		address originalGasTo,
		TvmCell payload
	) external override {
		TvmCell emptyPayload;
		bool needCancel = false;
		bool makeReserve = false;
		TvmSlice payloadSlice = payload.toSlice();
		uint64 callId;
		if (
			sender == root &&
			tokenRoot == spentToken &&
			(state == OrderStatus.Initialize || state == OrderStatus.AwaitTokens) &&
			amount >= initialAmount &&
			msg.sender.value != 0 && msg.sender == spentWallet &&
			payloadSlice.bits() >= 64
		) {
			callId = payloadSlice.decode(uint64);
			changeState(OrderStatus.Active, callId);
		} else {
			if ((msg.sender.value != 0 && msg.sender == receiveWallet) && state == OrderStatus.Active) {
				if (payloadSlice.bits() >= 192) {
					(uint128 deployWalletValue, uint64 callId) = payloadSlice.decode(uint128, uint64);
					if (
						msg.value >=
						OrderGas.FILL_ORDER_MIN_VALUE + deployWalletValue
					) {
						if (amount > currentAmountReceiveToken) {
							ITokenWallet(msg.sender).transfer{
								value: OrderGas.TRANSFER_MIN_VALUE,
								flag: MsgFlag.SENDER_PAYS_FEES,
								bounce: false
							}(
								amount - currentAmountReceiveToken,
								sender,
								uint128(0),
								originalGasTo,
								true,
								emptyPayload
							);

							ITokenWallet(spentWallet).transfer{
								value: OrderGas.TRANSFER_MIN_VALUE,
								flag: MsgFlag.SENDER_PAYS_FEES,
								bounce: false
							}(
								currentAmountSpentToken,
								sender,
								deployWalletValue,
								originalGasTo,
								true,
								emptyPayload
							);

							ITokenWallet(receiveWallet).transfer{
								value: OrderGas.TRANSFER_MIN_VALUE,
								flag: MsgFlag.SENDER_PAYS_FEES,
								bounce: false
							}(
								currentAmountReceiveToken,
								owner,
								uint128(0),
								originalGasTo,
								true,
								emptyPayload
							);

							currentAmountReceiveToken = 0;
							currentAmountSpentToken = 0;
						} else {
							makeReserve = true;
							uint128 transferAmount = math.muldiv(
								amount,
								initialAmount,
								expectedAmount
							);
							if (transferAmount > 0) {
								ITokenWallet(spentWallet).transfer{
									value: OrderGas.TRANSFER_MIN_VALUE,
									flag: MsgFlag.SENDER_PAYS_FEES,
									bounce: false
								}(
									transferAmount,
									sender,
									deployWalletValue,
									originalGasTo,
									true,
									emptyPayload
								);
							}

							currentAmountSpentToken -= transferAmount;
							currentAmountReceiveToken -= amount;

							if (currentAmountSpentToken > 0) {
								emit PartExchange(
									spentToken,
									transferAmount,
									receiveToken,
									amount,
									currentAmountSpentToken,
									currentAmountReceiveToken
								);

								//TODO Callback
								IOrderOperationCallback(msg.sender).orderPartExchangeSuccess{
									value: OrderGas.OPERATION_CALLBACK_BASE + 2,
                					flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                					bounce: false
            					}
								(callId, true, IPartExchangeResult.PartExchangeResult(
									spentToken,
									transferAmount,
									receiveToken,
									amount,
									currentAmountSpentToken,
									currentAmountReceiveToken));
							}

							ITokenWallet(receiveWallet).transfer{
								value: OrderGas.TRANSFER_MIN_VALUE,
								flag: MsgFlag.SENDER_PAYS_FEES,
								bounce: false
							}(
								amount,
								owner,
								uint128(0),
								originalGasTo,
								true,
								emptyPayload
							);
						}
					} else {
						needCancel = true;
					}
				} else {
					needCancel = true;
				}
			} else if (state == OrderStatus.SwapInProgress) {
				TvmSlice payloadSlice = payload.toSlice();
				if (payloadSlice.bits() >= 8) {
					uint8 operationStatus = payloadSlice.decode(uint8);
					if (
						(msg.sender.value != 0 && msg.sender == receiveWallet && tokenRoot == receiveToken)
						&& operationStatus == OrderOperationStatus.SUCCESS &&
						amount >= currentAmountReceiveToken
					) {
						makeReserve = true;
						(
							,
							address initiator,
							uint128 deployWalletValue
						) = payloadSlice.decode(uint64, address, uint128);

						// send owner
						ITokenWallet(receiveWallet).transfer{
							value: OrderGas.TRANSFER_MIN_VALUE,
							flag: MsgFlag.SENDER_PAYS_FEES,
							bounce: false
						}(
							currentAmountReceiveToken,
							owner,
							0,
							originalGasTo,
							true,
							emptyPayload
						);

						if (amount - currentAmountReceiveToken > 0) {
							// send the difference swap to initiator
							ITokenWallet(receiveWallet).transfer{
								value: OrderGas.TRANSFER_MIN_VALUE,
								flag: MsgFlag.SENDER_PAYS_FEES,
								bounce: false
							}(
								amount - currentAmountReceiveToken,
								initiator,
								deployWalletValue,
								initiator,
								true,
								emptyPayload
							);
						}

						currentAmountReceiveToken = 0;
						currentAmountSpentToken = 0;
					} else if (
						(msg.sender.value != 0 && msg.sender == spentWallet && tokenRoot == spentToken) &&
						operationStatus == OrderOperationStatus.CANCEL
					) {
						changeState(OrderStatus.Active);
					}
				}
			} else {
				needCancel = true;
			}
		}

		if (currentAmountReceiveToken == 0 && currentAmountSpentToken == 0) {
			changeState(OrderStatus.Filled);
			close();
		} else if (makeReserve) {
			tvm.rawReserve(
				math.max(
					address(this).balance - msg.value,
					OrderGas.FILL_ORDER_MIN_VALUE
				), 0
			);
			sender.transfer(
				0,
				false,
				MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
			);
		}

		if (needCancel) {
			tvm.rawReserve(
				math.max(
					address(this).balance - msg.value,
					OrderGas.FILL_ORDER_MIN_VALUE
				), 0
			);
			
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
	}

	function cancel() external onlyOwner {
		require(
			state == OrderStatus.Active,
			OrderErrors.NOT_ACTIVE_LIMIT_ORDER
		);
		changeState(OrderStatus.Cancelled);

		tvm.accept();
		close();
	}

	function backendSwap() external {
		require(
			msg.pubkey() == backPK,
			OrderErrors.NOT_BACKEND_PUB_KEY
		);

		require(
			state == OrderStatus.Active,
			OrderErrors.NOT_ACTIVE_LIMIT_ORDER
		);

		require(
			autoExchange == true,
			OrderErrors.NOT_AUTO_EXCHANGE
		);

		require(
			address(this).balance > OrderGas.SWAP_BACK_MIN_VALUE + 0.1 ton,
			OrderErrors.VALUE_TOO_LOW
		);

		tvm.accept();
		swapAttempt++;
		changeState(OrderStatus.SwapInProgress);

		TvmBuilder successBuilder;
		successBuilder.store(OrderOperationStatus.SUCCESS);
		successBuilder.store(swapAttempt);
		successBuilder.store(owner);
		successBuilder.store(uint128(0));

		TvmBuilder cancelBuilder;
		cancelBuilder.store(OrderOperationStatus.CANCEL);
		cancelBuilder.store(swapAttempt);

		TvmBuilder builder;
		builder.store(DexOperationTypes.EXCHANGE);
		builder.store(uint64(swapAttempt));
		builder.store(uint128(0));
		builder.store(currentAmountReceiveToken);

		builder.storeRef(successBuilder);
		builder.storeRef(cancelBuilder);

		ITokenWallet(spentWallet).transfer{
			value: OrderGas.SWAP_BACK_MIN_VALUE,
			flag: MsgFlag.SENDER_PAYS_FEES
		}(
			currentAmountSpentToken,
			dexPair,
			uint128(0),
			address(this),
			true,
			builder.toCell()
		);
	}

	function swap(uint128 deployWalletValue) external {
		require(
			state == OrderStatus.Active,
			OrderErrors.NOT_ACTIVE_LIMIT_ORDER
		);

		require(
			autoExchange == true,
			OrderErrors.NOT_AUTO_EXCHANGE
		);


		require(
			msg.value >= OrderGas.SWAP_MIN_VALUE,
			OrderErrors.VALUE_TOO_LOW
		);

		tvm.rawReserve(
			math.max(
				address(this).balance - msg.value,
				OrderGas.SWAP_MIN_VALUE
			),
			0
		);
		swapAttempt++;
		changeState(OrderStatus.SwapInProgress);

		TvmBuilder successBuilder;
		successBuilder.store(OrderOperationStatus.SUCCESS);
		successBuilder.store(swapAttempt);
		successBuilder.store(msg.sender);
		successBuilder.store(deployWalletValue);

		TvmBuilder cancelBuilder;
		cancelBuilder.store(OrderOperationStatus.CANCEL);
		cancelBuilder.store(swapAttempt);

		TvmBuilder builder;
		builder.store(DexOperationTypes.EXCHANGE);
		builder.store(swapAttempt);
		builder.store(uint128(0));
		builder.store(currentAmountReceiveToken);

		builder.storeRef(successBuilder);
		builder.storeRef(cancelBuilder);

		ITokenWallet(spentWallet).transfer{
			value: 0,
			flag: MsgFlag.ALL_NOT_RESERVED
		}(
			currentAmountSpentToken,
			dexPair,
			uint128(0),
			address(this),
			true,
			builder.toCell()
		);
	}

	function changeState(
	uint8 newState,
	optional(uint64) callId
	)
	private {
		uint8 prevStateN = state;
		state = newState;
		emit StateChanged(prevStateN, newState, buildDetails());
		if (callId.hasValue()){
			IOrderOperationCallback(msg.sender).orderStateChangedSuccess{
				value: OrderGas.OPERATION_CALLBACK_BASE + 2,
				flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
				bounce: false
			}
			(uint64(callId), true, IStateChangedResult.StateChangedResult(
				prevStateN, newState, buildDetails()));
		}

	}

	function buildDetails() private view returns (Details) {
		return
			Details(
				root,
				owner,
				backPK,
				dexRoot,
				dexPair,
				msg.sender,
				swapAttempt,
				state,
				spentToken,
				receiveToken,
				spentWallet,
				receiveWallet,
				expectedAmount,
				initialAmount,
				currentAmountSpentToken,
				currentAmountReceiveToken
			);
	}

	function close() internal {
		require(
			state == OrderStatus.Filled ||
				state == OrderStatus.Cancelled,
			OrderErrors.NOT_FILLED_OR_CANCEL_STATUS_LIMIT_OEDER
		);

		TvmBuilder builder;
		builder.store(factory);

		if (state == OrderStatus.Filled) {
			builder.store("Filled");
		} else {
			builder.store("Cancelled");
		}

		TvmCell saltNewCode = tvm.setCodeSalt(
			codeClosed,
			builder.toCell()
		);

		tvm.setcode(saltNewCode);
		tvm.setCurrentCode(saltNewCode);

		TvmBuilder builderUpg;
		builderUpg.store(state);
		builderUpg.store(owner);
		builderUpg.store(factory);
		builderUpg.store(root);
		builderUpg.store(swapAttempt);

		TvmBuilder builderTokens;
		builderTokens.store(spentWallet);
		builderTokens.store(currentAmountSpentToken);
		builderTokens.store(spentToken);
		builderTokens.store(receiveToken);
		builderUpg.storeRef(builderTokens);

		TvmBuilder builderSum;
		builderSum.store(expectedAmount);
		builderSum.store(initialAmount);
		builderSum.store(receiveWallet);
		builderUpg.storeRef(builderSum);

		onCodeUpgrade(builderUpg.toCell());
	}

	function enableEmergency(uint256 _emergencyManager)
		external
		override
		onlyFactory
	{
		require(msg.sender.value != 0 && msg.sender == factory);
		require(
			state != OrderStatus.Emergency,
			OrderErrors.EMERGENCY_STATUS_NOW
		);

		prevState = state;
		state = OrderStatus.Emergency;
		emergencyManager = _emergencyManager;

		emit StateChanged(prevState, state, buildDetails());
	}

	function disableEmergency() external override onlyFactory {
		require(msg.sender.value != 0 && msg.sender == factory);
		require(
			state == OrderStatus.Emergency,
			OrderErrors.EMERGENCY_STATUS_NOW
		);

		state = prevState;
		prevState = 0;
		emergencyManager = 0;

		emit StateChanged(
			OrderStatus.Emergency,
			state,
			buildDetails()
		);
	}

	function proxyTokensTransfer(
		address _tokenWallet,
		uint128 _gasValue,
		uint128 _amount,
		address _recipient,
		uint128 _deployWalletValue,
		address _remainingGasTo,
		bool _notify,
		TvmCell _payload
	) public view onlyEmergencyManager {
		require(
			state == OrderStatus.Emergency,
			OrderErrors.NOT_EMERGENCY_STATUS_NOW
		);
		tvm.accept();

		ITokenWallet(_tokenWallet).transfer{
			value: _gasValue,
			flag: MsgFlag.SENDER_PAYS_FEES
		}(
			_amount,
			_recipient,
			_deployWalletValue,
			_remainingGasTo,
			_notify,
			_payload
		);
	}

	function sendGas(
		address to,
		uint128 _value,
		uint16 _flag
	) public view onlyEmergencyManager { 
		require(
			state == OrderStatus.Emergency,
			OrderErrors.NOT_EMERGENCY_STATUS_NOW
		);
		tvm.accept();
		to.transfer({value: _value, flag: _flag, bounce: false});
	}

	function onCodeUpgrade(TvmCell data) private {}
}
