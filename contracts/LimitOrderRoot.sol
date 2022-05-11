pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrderGas.sol";
import "./libraries/LimitOrderErrors.sol";
import "./interfaces/ILimitOrderRoot.sol";

import "./LimitOrder.sol";

import "./interfaces/ILimitOrderFactory.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract LimitOrderRoot is IAcceptTokensTransferCallback, ILimitOrderRoot  {
    address static spentTokenRoot; //!!!
    address static limitOrderFactory; //!!!
    
    uint32 version;
    TvmCell limitOrderCode;
    TvmCell limitOrderCodeClosed;

    address spentTokenWallet;
    address deployer;
    address dexRoot;

    constructor(
        address deployer_,
        address dexRoot_, 
        TvmCell limitOrderCode_, 
        TvmCell limitOrderCodeClosed_, 
        uint32 version_
    ) public {
        tvm.rawReserve(LimitOrderGas.TARGET_BALANCE, 0);
        if (msg.sender.value != 0 && msg.sender == limitOrderFactory) {
            deployer = deployer_;
            dexRoot = dexRoot_;
            limitOrderCode = limitOrderCode_; 
            limitOrderCodeClosed = limitOrderCodeClosed_;
            version = version_;

            ITokenRoot(spentTokenRoot).deployWallet{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                callback: LimitOrderRoot.onTokenWallet
            }(address(this), LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS);
        } else {
            msg.sender.transfer(
                0,
                false,
                MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            );
        }
    }

    function onTokenWallet(address _wallet) external {
        require(
            msg.sender.value != 0 && msg.sender == spentTokenRoot,
            LimitOrderErrors.NOT_TOKEN1_ROOT
        );
        tvm.rawReserve(LimitOrderGas.TARGET_BALANCE, 0);
        spentTokenWallet = _wallet;

        ILimitOrderFactory(limitOrderFactory).onLimitOrderRootDeployed{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(address(this), spentTokenRoot, deployer);
    }

    function onTokenWalletReceive(address _wallet) external {}

    onBounce(TvmSlice body) external view {
        tvm.rawReserve(LimitOrderGas.TARGET_BALANCE, 0);

        uint32 functionId = body.decode(uint32);

        if (
            functionId == tvm.functionId(ITokenRoot.deployWallet) &&
            msg.sender == spentTokenRoot
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

    function getSpentTokenRoot() override external view responsible returns(address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } spentTokenRoot;
    }

    function getFactoryAddress() override external view responsible returns(address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } limitOrderFactory;
    }

    function buildPayload(
        address tokenRootReceive,
        uint128 expectedTokenAmount,
        uint128 deployWalletValue,
        uint256 backPubKey              
    ) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(tokenRootReceive);
        builder.store(expectedTokenAmount);
        builder.store(deployWalletValue);
        builder.store(backPubKey);       
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
        tvm.rawReserve(LimitOrderGas.DEPLOY_ORDER_MIN_VALUE, 0);

        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 779 &&
            msg.sender.value != 0 &&
            msg.sender == spentTokenWallet) 
        {
            (
                address receiveTokenRoot,
                uint128 expectedAmount,
                uint128 deployWalletValue,
                uint256 backPubKey
            ) = payloadSlice.decode(address, uint128, uint128, uint256);

            TvmCell indexCode = buildCode(
                receiveTokenRoot,
                limitOrderCode
            );

            TvmCell stateInit_ = buildState(sender, indexCode, receiveTokenRoot);
            address limitOrderAddress = new LimitOrder{
                stateInit: stateInit_,
                value: LimitOrderGas.DEPLOY_ORDER_MIN_VALUE
            }(
                expectedAmount,
                amount, 
                backPubKey, 
                dexRoot, 
                limitOrderCodeClosed
            );

            emit CreateLimitOrder(
                limitOrderAddress, 
                tokenRoot, 
                amount, 
                receiveTokenRoot,
                expectedAmount);

            ITokenRoot(receiveTokenRoot).deployWallet { 
                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrderRoot.onTokenWalletReceive
            }(
                sender,
                LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS
            );

            ITokenWallet(msg.sender).transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                amount,
                limitOrderAddress,
                (deployWalletValue <= LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS? deployWalletValue:LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS),
                originalGasTo,
                true,
                payload
            );
        } else {
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

    function expectedAddressLimitOrder(
        address _limitOrderRoot,
        address _limitOrderFactory,
        address owner,
        address spentTokenRoot_,
        address receiveTokenRoot,
        uint64 timeTx,
        uint64 nowTx
    ) override external view responsible returns (address) 
    {
        TvmBuilder salt;
        salt.store(_limitOrderRoot);
        salt.store(receiveTokenRoot);

       return address(tvm.hash(
           tvm.buildStateInit({
               contr: LimitOrder,
               varInit: {
                    limitOrderRoot: _limitOrderRoot,
                    factoryOrderRoot: _limitOrderFactory,
                    ownerAddress: owner,
                    spentTokenRoot: spentTokenRoot_,
                    receiveTokenRoot: receiveTokenRoot,
                    timeTx: timeTx,
                    nowTx: nowTx    
               },
               code: tvm.setCodeSalt(limitOrderCode, salt.toCell())  
           })
       ));    
    }

    function buildCode(
        address receiveTokenRoot,
        TvmCell limitOrderCode_
    ) internal pure returns (TvmCell){
        TvmBuilder salt;
        salt.store(address(this));
        salt.store(receiveTokenRoot);
        return tvm.setCodeSalt(limitOrderCode_, salt.toCell());
    }

    function buildState(
        address sender,
        TvmCell code_,
        address receiveTokenRoot
    ) internal view returns (TvmCell){
        return tvm.buildStateInit({
                contr: LimitOrder,
                varInit: {
                    factoryOrderRoot: limitOrderFactory,
                    limitOrderRoot: address(this),
                    ownerAddress: sender,
                    spentTokenRoot: spentTokenRoot,
                    receiveTokenRoot: receiveTokenRoot,
                    timeTx: tx.timestamp,
                    nowTx: uint64(now)
                    },
                code: code_
            });
    }
}
