pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/OrderGas.sol";
import "./libraries/OrderStatus.sol";
import "./libraries/OrderErrors.sol";

import "./interfaces/IOrderClosed.sol";
import "./interfaces/IHasEmergencyMode.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";

contract OrderClosed is 
	IAcceptTokensTransferCallback, 
	IOrderClosed, 
	IHasEmergencyMode 
{
	address static factory;
	address static root;
	address static owner;
	address static spentToken;
	address static receiveToken;

	uint128 expectedAmount;
	uint128 initialAmount;

	uint128 currentAmountSpentToken;

	address spentWallet;
	address receiveWallet;

	uint8 state;
	uint64 swapAttempt;

	uint8 prevState;
	uint256 emergencyManager;

	constructor() public { revert(); }

	modifier onlyFactory() {	
		require(
			msg.sender.value != 0 && msg.sender == factory,
			OrderErrors.NOT_FACTORY_LIMIT_ORDER_ROOT
		);
		_;
	}

	modifier onlyEmergencyManager() {
        require(
            emergencyManager != 0 && (msg.sender.value == emergencyManager || msg.pubkey() == emergencyManager),
            OrderErrors.NOT_EMERGENCY_MANAGER
        );  
        _;  
    }

	function currentStatus() override external view responsible returns(uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } state;
    }

    function initParams() override external view responsible returns(InitParams){
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } InitParams(
            root,
            factory,
            owner,
            spentToken,
            receiveToken
        );
    }

    function getDetails() override external view responsible returns(Details){
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } buildDetails();
    }

	function onAcceptTokensTransfer(
		address, /*tokenRoot*/
		uint128 amount,
		address sender,
		address, /*senderWallet*/
		address originalGasTo,
		TvmCell /*payload*/
	) external override {
		tvm.rawReserve(math.max(OrderGas.TARGET_BALANCE, address(this).balance - msg.value), 0);
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

	function enableEmergency(uint256 _emergencyManager) override external onlyFactory {
        require(state != OrderStatus.Emergency, OrderErrors.EMERGENCY_STATUS_NOW);
        
        prevState = state;
        state = OrderStatus.Emergency;
        emergencyManager = _emergencyManager;
		emit StateChanged(prevState, state, buildDetails());
    }

    function disableEmergency() override external onlyFactory {
        require(state == OrderStatus.Emergency, OrderErrors.EMERGENCY_STATUS_NOW);

        state = prevState;
        prevState = 0;
        emergencyManager = 0;
		emit StateChanged(OrderStatus.Emergency, state, buildDetails());
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
		require(state == OrderStatus.Emergency, OrderErrors.NOT_EMERGENCY_STATUS_NOW);
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
        uint16  _flag
    ) public view onlyEmergencyManager {
		require(state == OrderStatus.Emergency, OrderErrors.NOT_EMERGENCY_STATUS_NOW);
        tvm.accept();
        to.transfer({value: _value, flag: _flag, bounce: false});
    }

	function buildDetails() private view returns(Details){
        return Details(
            root,
            owner,
            swapAttempt,

            state,

            spentToken,
            receiveToken,

            spentWallet,
            receiveWallet,

            expectedAmount,
            initialAmount,

			currentAmountSpentToken
        );
    }

	function upgrade(TvmCell newCode) internal onlyFactory { 
		tvm.setcode(newCode);
		tvm.setCurrentCode(newCode);

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

	function onCodeUpgrade(TvmCell data) private {

		tvm.resetStorage();
		TvmSlice upg = data.toSlice();
	
		(
			uint8 _state, 
			address _owner,
			address _factory,
			address _root,
			uint64 _swapAttempt
		) = upg.decode(uint8, address, address, address, uint64);

		state = _state;
		owner = _owner;
		factory = _factory;
		root = _root;
		swapAttempt = _swapAttempt;

		TvmSlice dataTokens = upg.loadRefAsSlice();
		(
			address _spentWallet, 
			uint128 _currentAmountSpentToken,
			address _spentToken,
			address _receiveToken
		) = dataTokens.decode(address, uint128, address, address);

		spentWallet = _spentWallet;
		currentAmountSpentToken = _currentAmountSpentToken;
		spentToken = _spentToken;
		receiveToken = _receiveToken;

		TvmSlice dataSum = upg.loadRefAsSlice();
		(
			uint128 _expectedAmount,
			uint128 _initialAmount,
			address _receiveWallet
		) = dataSum.decode(uint128, uint128, address);

		expectedAmount = _expectedAmount;
		initialAmount = _initialAmount;
		receiveWallet = _receiveWallet;

		if (state == OrderStatus.Cancelled) {
			TvmCell emptyPayload;
			ITokenWallet(spentWallet).transfer{
				value: 0,
				flag: MsgFlag.ALL_NOT_RESERVED,
				bounce: false
			}(
				currentAmountSpentToken,
				owner, 
				0, 
				owner,
				true, 
				emptyPayload
			);
		} else {
			owner.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
		}
	}
}
