pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrderGas.sol";
import "./libraries/LimitOrderStatus.sol";
import "./libraries/LimitOrderErrors.sol";

import "./interfaces/ILimitOrderClosed.sol";
import "./interfaces/IHasEmergencyMode.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";

contract LimitOrderClosed is IAcceptTokensTransferCallback, ILimitOrderClosed, IHasEmergencyMode {
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

	uint8 prevState;
	uint256 emergencyManager;

	modifier onlyLimitOrderFactory() {	
		require(
			msg.sender.value != 0 && msg.sender == factoryOrderRoot,
			LimitOrderErrors.NOT_FACTORY_LIMIT_ORDER_ROOT
		);
		_;
	}

	modifier onlyEmergencyManager() {
        require(
            emergencyManager != 0 && (msg.sender.value == emergencyManager || msg.pubkey() == emergencyManager),
            LimitOrderErrors.NOT_EMERGENCY_MANAGER
        );  
        _;  
    }

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

	function enableEmergency(uint256 _emergencyManager) override external onlyLimitOrderFactory {
        require(state != LimitOrderStatus.Emergency, LimitOrderErrors.EMERGENCY_STATUS_NOW);
        
        prevState = state;
        state = LimitOrderStatus.Emergency;
        emergencyManager = _emergencyManager;
		emit LimitOrderStateChanged(prevState, state, builderDetails());
    }

    function disableEmergency() override external onlyLimitOrderFactory {
        require(state == LimitOrderStatus.Emergency, LimitOrderErrors.EMERGENCY_STATUS_NOW);

        state = prevState;
        prevState = 0;
        emergencyManager = 0;
		emit LimitOrderStateChanged(LimitOrderStatus.Emergency, state, builderDetails());
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
		require(state == LimitOrderStatus.Emergency, LimitOrderErrors.NOT_EMERGENCY_STATUS_NOW);
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
        uint128 value_,
        uint16  flag_
    ) public view onlyEmergencyManager {
		require(state == LimitOrderStatus.Emergency, LimitOrderErrors.NOT_EMERGENCY_STATUS_NOW);
        tvm.accept();
        to.transfer({value: value_, flag: flag_, bounce: false});
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

	function upgrade(TvmCell newCode) internal onlyLimitOrderFactory { 
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
