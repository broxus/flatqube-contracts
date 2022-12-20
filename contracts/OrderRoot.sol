pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/OrderGas.sol";
import "./libraries/OrderErrors.sol";
import "./interfaces/IOrderRoot.sol";
import "./interfaces/IOrderFactory.sol";
import "./interfaces/IOrderOperationCallback.sol";

import "./structures/IOrderRootCreateResult.sol";

import "./Order.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract OrderRoot is IAcceptTokensTransferCallback, IOrderRoot  {
    address factory;
    address spentToken;
    
    uint32 version;
    TvmCell orderCode;
    TvmCell orderClosedCode;

    address spentTokenWallet;
    address deployer;
    address dexRoot;
    
    constructor() public { revert(); }

    modifier onlyFactory() {
		require(
			msg.sender.value != 0 && msg.sender == factory,
			OrderErrors.NOT_FACTORY_LIMIT_ORDER_ROOT
		);
		_;
	}

    function onTokenWallet(address _wallet) external {
        require(
            msg.sender.value != 0 && msg.sender == spentToken,
            OrderErrors.NOT_TOKEN1_ROOT
        );
        tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);
        spentTokenWallet = _wallet;

        IOrderFactory(factory).onOrderRootDeployed{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(address(this), spentToken, deployer); //????address(this)
    }

    function onTokenWalletReceive(address _wallet) external {}

    onBounce(TvmSlice body) external view {
        tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);
        uint32 functionId = body.decode(uint32);

        if (
            functionId == tvm.functionId(ITokenRoot.deployWallet) &&
            msg.sender == spentToken
        ){
            deployer.transfer(
                0,
                false,
                MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            );
        }
    }

    function getVersion() override external view responsible returns (uint32) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } version;
    }

    function getSpentToken() override external view responsible returns(address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } spentToken;
    }

    function getFactory() override external view responsible returns(address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } factory;
    }

    function buildPayload(
        uint64 callbackId,
        address tokenReceive,
        uint128 expectedTokenAmount,
        uint128 deployWalletValue,
        uint256 backPK
    ) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(callbackId);
        builder.store(tokenReceive);
        builder.store(expectedTokenAmount);
        builder.store(deployWalletValue);
        builder.store(backPK);

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
        tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);

        //TODO change condition
        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 843 &&
            msg.sender.value != 0 &&
            msg.sender.value >= OrderGas.DEPLOY_ORDER_MIN_VALUE &&
            msg.sender == spentTokenWallet) 
        {
            (
                uint64 callbackId,
                address receiveToken,
                uint128 expectedAmount,
                uint128 deployWalletValue,
                uint256 backPubKey
            ) = payloadSlice.decode(uint64, address, uint128, uint128, uint256);

            TvmCell indexCode = buildCode(
                receiveToken,
                orderCode
            );

            TvmCell stateInit = buildState(sender, indexCode, receiveToken);
            address orderAddress = new Order{
                stateInit: stateInit,
                value: OrderGas.DEPLOY_ORDER_MIN_VALUE
            }(
                expectedAmount,
                amount, 
                backPubKey, 
                dexRoot, 
                orderClosedCode
            );

            emit CreateOrder(orderAddress, tokenRoot, amount, receiveToken, expectedAmount);

            IOrderOperationCallback(msg.sender).onOrderCreateOrderSuccess{
                value: OrderGas.OPERATION_CALLBACK_BASE,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(callbackId);

            ITokenRoot(receiveToken).deployWallet { 
                value: OrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: OrderRoot.onTokenWalletReceive
            }(
                sender, OrderGas.DEPLOY_EMPTY_WALLET_GRAMS);

            ITokenWallet(msg.sender).transfer{
                value: 0, flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                amount,
                orderAddress,
                (deployWalletValue <= OrderGas.DEPLOY_EMPTY_WALLET_GRAMS? deployWalletValue:OrderGas.DEPLOY_EMPTY_WALLET_GRAMS),
                originalGasTo,
                true,
                payload
            );
        } else {
            if (payloadSlice.bits() == 843){
                uint64 callbackId = payloadSlice.decode(uint64);
                IOrderOperationCallback(msg.sender).onOrderCreateOrderReject{
                    value: OrderGas.OPERATION_CALLBACK_BASE,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(callbackId);
            }

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
    }

    function expectedAddressOrder(
        address _factory,
        address _root,
        address _owner,
        address _spentToken,
        address _receiveToken,
        uint64 timeTx,
        uint64 nowTx
    ) override external view responsible returns (address) 
    {
        TvmBuilder salt;
        salt.store(_root);
        salt.store(_receiveToken);

       return {
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            } address(tvm.hash(
           tvm.buildStateInit({
               contr: Order,
               varInit: {
                    factory: _factory,
                    root: _root,
                    owner: _owner,
                    spentToken: _spentToken,
                    receiveToken: _receiveToken,
                    timeTx: timeTx,
                    nowTx: nowTx    
               },
               code: tvm.setCodeSalt(orderCode, salt.toCell())  
           })
       ));    
    }

    function buildCode(
        address _receiveToken,
        TvmCell _orderCode
    ) internal pure returns (TvmCell){
        TvmBuilder salt;
        salt.store(address(this));
        salt.store(_receiveToken);
        return tvm.setCodeSalt(_orderCode, salt.toCell());
    }

    function buildState(
        address sender,
        TvmCell _code,
        address _receiveToken
    ) internal view returns (TvmCell){
        return tvm.buildStateInit({
            contr: Order,
            varInit: {
                factory: factory,
                root: address(this),
                owner: sender,
                spentToken: spentToken,
                receiveToken: _receiveToken,
                timeTx: tx.timestamp,
                nowTx: uint64(now)
                },
            code: _code
        });
    }

    function upgrade(
        TvmCell _code, 
        uint32 _newVersion, 
        address _sendGasTo
    ) external override onlyFactory {
        if (version == _newVersion) {
            tvm.rawReserve(address(this).balance - msg.value, 0);
            _sendGasTo.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS });
        } else {
            emit OrderRootCodeUpgraded(_newVersion);

            TvmBuilder builder;
            builder.store(spentToken);
            builder.store(factory);
            builder.store(version);
            builder.store(orderCode);
            builder.store(orderClosedCode);

            TvmBuilder builder1;
            builder1.store(spentTokenWallet);
            builder1.store(deployer);
            builder1.store(dexRoot);
            builder.storeRef(builder1);

            tvm.setcode(_code);
            tvm.setCurrentCode(_code);

            onCodeUpgrade(builder.toCell());
        }
    }

    function onCodeUpgrade(TvmCell _data) private {
        TvmSlice sl = _data.toSlice();
        uint64 callbackId;
        address _factory;
        address _spentToken;
        uint32 oldVersion;
        uint32 newVersion;
        address _deployer;

        if (sl.bits() >= 929){
            (
                _factory,
                _spentToken,
                oldVersion,
                newVersion,
                _deployer,
                callbackId
            ) = sl.decode(address, address, uint32, uint32, address, uint64);
        } else {
            (
                _factory,
                _spentToken,
                oldVersion,
                newVersion,
                _deployer
            ) = sl.decode(address, address, uint32, uint32, address);
        }

        if (oldVersion == 0) {
            tvm.resetStorage();
        }
        factory = _factory;
        spentToken = _spentToken;
        version = newVersion;
        deployer = _deployer;

        TvmSlice dataSl = sl.loadRefAsSlice();
        dexRoot = dataSl.decode(address);
        orderCode = dataSl.loadRef();
        orderClosedCode = dataSl.loadRef();

        tvm.rawReserve(OrderGas.TARGET_BALANCE, 0);

        ITokenRoot(spentToken).deployWallet{
            value: OrderGas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: OrderRoot.onTokenWallet
        }(
            address(this), 
            OrderGas.DEPLOY_EMPTY_WALLET_GRAMS
        );

        IOrderOperationCallback(msg.sender).onOrderRootCreateSuccess{
				value: OrderGas.OPERATION_CALLBACK_BASE,
				flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
				bounce: false
        }(
            callbackId,
            IOrderRootCreateResult.OrderRootCreateResult(
                factory,
                spentToken,
                oldVersion,
                newVersion,
                deployer
            )
        );

        deployer.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }
}
