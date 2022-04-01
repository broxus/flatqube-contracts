pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrdersGas.sol";
import "./libraries/LimitOrdersErrors.sol";
import "./LimitOrder.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "./interfaces/ILimitOrderFactory.sol";

contract LimitOrdersRoot is IAcceptTokensTransferCallback {
    address static tokenRoot_;
    address static limitOrdersFactory;
    
    TvmCell limitOrderCode;
    TVMCell limitOrderCodeCancel;

    address wallet;
    address deployer;
    address dexRoot;

    constructor(address deployer_, address dexRoot_, TvmCell limitOrderCode_, TvmCell limitOrderCodeCancel_) public {
        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        if (msg.sender.value != 0 && msg.sender == limitOrdersFactory) {
            deployer = deployer_;
            dexRoot = dexRoot_;
            limitOrderCode = limitOrderCode_; 
            limitOrderCodeCancel = limitOrderCodeCancel_;

            ITokenRoot(tokenRoot_).deployWallet{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                callback: LimitOrdersRoot.onTokenWallet
            }(address(this), LimitOrdersGas.DEPLOY_EMPTY_WALLET_GRAMS);
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
            msg.sender.value != 0 && msg.sender == tokenRoot_,
            LimitOrdersErrors.NOT_TOKEN1_ROOT
        );
        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        wallet = _wallet;

        ILimitOrderFactory(limitOrdersFactory).onLimitOrderRootDeployed{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(address(this), tokenRoot_, deployer);
    }

    onBounce(TvmSlice body) external {
        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);

        uint32 functionId = body.decode(uint32);

        if (
            functionId == tvm.functionId(ITokenRoot.deployWallet) &&
            msg.sender == tokenRoot_
        ) {
            deployer.transfer(
                0,
                false,
                MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            );
        }
    }

    function buildPayload(
        address tokenRootRecieve,
        uint128 expectedTokenAmount,
        uint128 deployWalletValue,
        uint256 backPubKey
    ) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(tokenRootRecieve);
        builder.store(expectedTokenAmount);
        builder.store(deployWalletValue);
        builder.store(backPubKey);
        return builder.toCell();
    }

    function onAcceptTokensTransfer(
        address, /*tokenRoot*/
        uint128 amount,
        address sender,
        address, /*senderWallet*/
        address original_gas_to,
        TvmCell payload
    ) external override {
        tvm.rawReserve(LimitOrdersGas.DEPLOY_ORDER_MIN_VALUE, 0);

        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 779 &&
            msg.sender.value != 0 &&
            msg.sender == wallet) 
        {
            (
                address tokenRoot2,
                uint128 expectedAmount,
                uint128 deployWalletValue,
                uint256 backPubKey
            ) = payloadSlice.decode(address, uint128, uint128, uint256);

            TvmCell indexCode = buildCode(
                tokenRoot2,
                limitOrderCode
            );

            TvmCell stateInit_ = buildState(indexCode, tokenRoot2);
            address limitOrderAddress = new LimitOrder{
                stateInit: stateInit_,
                value: LimitOrdersGas.DEPLOY_ORDER_MIN_VALUE
            }(
                expectedAmount,
                amount, 
                backPubKey, 
                dexRoot, 
                limitOrderCodeCancel
            );

            // Create wallet for owner token2
            ITokenWallet(tokenRoot_).deployWallet{
                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                msg.sender,
                LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS
            );

            ITokenWallet(msg.sender).transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                amount,
                limitOrderAddress,
                (deployWalletValue <= LimitOrdersGas.DEPLOY_EMPTY_WALLET_GRAMS? deployWalletValue:LimitOrdersGas.DEPLOY_EMPTY_WALLET_GRAMS),
                original_gas_to,
                false,
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
                original_gas_to,
                true,
                emptyPayload
            );
        }
    }

    function buildCode(
        address tokenRoot2,
        TvmCell limitOrderCode_
    ) internal pure returns (TvmCell){
        TvmBuilder salt;
        salt.store(address(this));
        salt.store(tokenRoot2);
        return tvm.setCodeSalt(limitOrderCode_, salt.toCell());
    }

    function buildState(
        TvmCell code_,
        address tokenRoot2
    ) internal view returns (TvmCell){
        return
            tvm.buildStateInit({
                contr: LimitOrder,
                varInit: {
                            limitOrderAddress: address(this),
                            ownerAddress: msg.sender,
                            tokenRoot1: tokenRoot_,
                            tokenRoot2: tokenRoot2,
                            timeTx: tx.timestamp,
                            nowTx: uint64(now)
                        },
                code: code_
            });
    }
}
