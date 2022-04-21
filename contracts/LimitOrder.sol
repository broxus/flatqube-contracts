pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrderGas.sol";
import "./libraries/LimitOrderErrors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/LimitOrderStatus.sol";
import "./libraries/LimitOrderOperationStatus.sol";

import "./interfaces/ILimitOrder.sol";
import "./interfaces/IDexRoot.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol"; 
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import 'ton-eth-bridge-token-contracts/contracts/interfaces/TIP3TokenWallet.sol';
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract LimitOrder is IAcceptTokensTransferCallback, ILimitOrder {
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

    TvmCell limitOrderCodeClosed;

    uint8 state;

    uint64 swapAttempt;

    constructor(
        uint128 expectedAmount_,
        uint128 initialAmount_,
        uint256 backendPubKey_,
        address dexRoot_,
        TvmCell limitOrderCodeClosed_
    ) public {
        changeState(LimitOrderStatus.Initialize);
        optional(TvmCell) optSalt = tvm.codeSalt(tvm.code());
        require(optSalt.hasValue(), LimitOrderErrors.EMPTY_SALT_IN_ORDER);
        (address limitOrdersRootSalt, address tokenRootSalt) = optSalt
            .get()
            .toSlice()
            .decode(address, address);

        if (
            limitOrdersRootSalt == limitOrdersRoot &&
            tokenRootSalt == receiveTokenRoot &&
            msg.sender.value != 0 &&
            msg.sender == limitOrdersRoot
        ) {
            tvm.rawReserve(address(this).balance - msg.value, 0); 
            
            expectedAmount = expectedAmount_;
            initialAmount = initialAmount_;
            currentAmountSpentToken = initialAmount;
            currentAmountReceiveToken = expectedAmount;
            backendPubKey = backendPubKey_;
            dexRoot = dexRoot_;
            limitOrderCodeClosed = limitOrderCodeClosed_;

            IDexRoot(dexRoot).getExpectedPairAddress{
                value: LimitOrderGas.GET_DEX_PAIR,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                spentTokenRoot,
                receiveTokenRoot
            );

            ITokenRoot(spentTokenRoot).deployWallet{
                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                address(this), 
                LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS
            );

            ITokenRoot(receiveTokenRoot).deployWallet{
                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                address(this),
                LimitOrderGas.DEPLOY_EMPTY_WALLET_GRAMS
            );
        } else {
            msg.sender.transfer(
                0,
                false,
                MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            );
        }
    }

    modifier onlyLimitOrderFactory() {
        require(
            msg.sender.value != 0 && msg.sender == factoryOrderRoot, 
            LimitOrderErrors.NOT_FACTORY_LIMIT_ORDERS_ROOT
        );
        _;
    }

    modifier onlyLimitOrderOwner() {
        require(
            msg.sender.value != 0 && msg.sender == ownerAddress,
            LimitOrderErrors.NOT_LIMITS_ORDER_OWNER
        );
        _;
    }

    function getBeginData(address inAddress) external {
        require(
            msg.sender.value != 0 &&
                (msg.sender == dexRoot ||
                    msg.sender == spentTokenRoot ||
                    msg.sender == receiveTokenRoot),
            LimitOrderErrors.NOT_BEGIN_DATA
        );

        if (msg.sender == dexRoot) {
            dexPair == inAddress;
        } else if (msg.sender == spentTokenRoot) {
            spentWallet = inAddress;
        } else if (msg.sender == receiveTokenRoot) {
            receiveWallet = inAddress;
        }

        if (
            dexPair.value != 0 &&
            spentWallet.value != 0 &&
            receiveWallet.value != 0
        ) {
            TIP3TokenWallet(receiveWallet).balance {
                value: LimitOrderGas.GET_BALANCE_WALLET,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBalanceReceiveWallet
            }();
        }
    }

    function getBalanceReceiveWallet(uint128 _balance) external {
        require(
            msg.sender.value != 0 && msg.sender == receiveWallet,
            LimitOrderErrors.NOT_WALLET_TOKEN_2
        );

        if (_balance >= expectedAmount) {
            changeState(LimitOrderStatus.Active);
        } else {
            changeState(LimitOrderStatus.AwaitTokens);
        }
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

        if (msg.sender == receiveWallet && tokenRoot == receiveTokenRoot) {
            if (sender == limitOrdersRoot && state == LimitOrderStatus.AwaitTokens && amount >= expectedAmount) {
               changeState(LimitOrderStatus.Active);
            } else if (state == LimitOrderStatus.Active) {
                TvmSlice payloadSlice = payload.toSlice();
                if (payloadSlice.bits() >= 128 ) {
                    (uint128 deployWalletValue) = payloadSlice.decode(uint128);
                    if (msg.value >= LimitOrderGas.FILL_ORDER_MIN_VALUE + deployWalletValue) {
                        if (amount > currentAmountReceiveToken) {
                            tvm.rawReserve(math.max(address(this).balance - msg.value, LimitOrderGas.FILL_ORDER_MIN_VALUE), 0);

                            ITokenWallet(msg.sender).transfer {
                                value: LimitOrderGas.TRANSFER_MIN_VALUE, 
                                flag: MsgFlag.SENDER_PAYS_FEES,
                                bounce: false
                            }(
                                amount - currentAmountReceiveToken, 
                                sender,
                                0,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            ITokenWallet(spentWallet).transfer {
                                value: LimitOrderGas.TRANSFER_MIN_VALUE,
                                flag: MsgFlag.SENDER_PAYS_FEES,
                                bounce: false
                            }(
                                currentAmountSpentToken,
                                msg.sender,
                                deployWalletValue,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            ITokenWallet(receiveWallet).transfer {
                                value: 0,
                                flag: MsgFlag.ALL_NOT_RESERVED,
                                bounce: false
                            }(
                                currentAmountReceiveToken,
                                ownerAddress,
                                0,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            currentAmountReceiveToken = 0;
                            currentAmountSpentToken = 0;

                        } else {
                            tvm.rawReserve(math.max(address(this).balance - msg.value, LimitOrderGas.FILL_ORDER_MIN_VALUE), 0); 
                            
                            uint128 transferAmount = math.muldiv(amount, initialAmount, expectedAmount); 
                            if (transferAmount > 0) {
                                ITokenWallet(spentWallet).transfer {
                                    value: LimitOrderGas.TRANSFER_MIN_VALUE,
                                    flag: MsgFlag.SENDER_PAYS_FEES,
                                    bounce: false
                                }(
                                    transferAmount,
                                    msg.sender,
                                    deployWalletValue,
                                    originalGasTo,
                                    true,
                                    emptyPayload
                                );
                            }
                            
                            ITokenWallet(receiveWallet).transfer {
                                value: LimitOrderGas.TRANSFER_MIN_VALUE,
                                flag: MsgFlag.ALL_NOT_RESERVED,
                                bounce: false
                            }(
                                amount,
                                ownerAddress,
                                0,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            currentAmountReceiveToken -= amount;
                            currentAmountSpentToken -= transferAmount;
                        }
                    } else {
                        needCancel = true;    
                    }
                } else {
                    needCancel = true;
                }
            } else if (state == LimitOrderStatus.SwapInProgress) {
                TvmSlice payloadSlice = payload.toSlice();
                if (payloadSlice.bits() >= 8) {
                    uint8 operationStatus = payloadSlice.decode(uint8);
                    if (operationStatus == LimitOrderOperationStatus.SUCCESS && amount >= currentAmountReceiveToken) { 
                        tvm.rawReserve(math.max(address(this).balance - msg.value, LimitOrderGas.FILL_ORDER_MIN_VALUE), 0);
                        (, address initiator, uint128 deployWalletValue) = payloadSlice.decode(uint64, address, uint128);
                         
                         // send owner
                        ITokenWallet(receiveWallet).transfer{
                            value: LimitOrderGas.TRANSFER_MIN_VALUE,
                            flag: MsgFlag.SENDER_PAYS_FEES,
                            bounce: false
                        }(
                            currentAmountReceiveToken,
                            ownerAddress,
                            0,
                            originalGasTo,
                            true,
                            emptyPayload
                        );   

                        if (amount - currentAmountReceiveToken > 0) {
                            // send the difference swap to initiator
                            ITokenWallet(receiveWallet).transfer{
                                value: LimitOrderGas.TRANSFER_MIN_VALUE,
                                flag: MsgFlag.ALL_NOT_RESERVED,
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
                        operationStatus == LimitOrderOperationStatus.CANCEL
                    ) {
                        changeState(LimitOrderStatus.Active);
                    }
                }
            } else {
                needCancel = true;
            }
        } else {
            needCancel = true;
        }

        if (needCancel) {
            ITokenWallet(msg.sender).transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(amount, sender, uint128(0), originalGasTo, true, emptyPayload);
        }

        if (currentAmountReceiveToken == 0 && currentAmountSpentToken == 0){
            changeState(LimitOrderStatus.Filled); 
            closeLimitOrder();
        }
    }

    function cancelOrder() external onlyLimitOrderOwner {
        require(state == LimitOrderStatus.Active, LimitOrderErrors.NOT_ACTIVE_LIMIT_ORDER);        
        changeState(LimitOrderStatus.Cancelled);

        tvm.accept();
        tvm.rawReserve(address(this).balance - msg.value, 0);

        closeLimitOrder();
    }

    function backLimitOrderSwap() external {
        require(msg.pubkey() == backendPubKey, LimitOrderErrors.NOT_BACKEND_PUB_KEY);
        require(state == LimitOrderStatus.Active, LimitOrderErrors.NOT_ACTIVE_LIMIT_ORDER);
        require(address(this).balance > LimitOrderGas.SWAP_BACK_MIN_VALUE + 0.1 ton, LimitOrderErrors.VALUE_TOO_LOW);
        
        tvm.accept();
        swapAttempt++;
        changeState(LimitOrderStatus.SwapInProgress);
         
        TvmBuilder successBuilder;
        successBuilder.store(LimitOrderOperationStatus.SUCCESS);
        successBuilder.store(swapAttempt);
        successBuilder.store(msg.sender);
        successBuilder.store(uint64(0));

        TvmBuilder cancelBuilder;
        cancelBuilder.store(LimitOrderOperationStatus.CANCEL);
        cancelBuilder.store(swapAttempt);

        TvmBuilder builder;
        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(uint64(swapAttempt));
        builder.store(uint128(0));
        builder.store(currentAmountReceiveToken);

        builder.store(successBuilder);
        builder.store(cancelBuilder);

        ITokenWallet(spentWallet).transfer{
            value: LimitOrderGas.SWAP_BACK_MIN_VALUE,
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

    function limitOrderSwap(uint128 deployWalletValue) external {
        require(state == LimitOrderStatus.Active, LimitOrderErrors.NOT_ACTIVE_LIMIT_ORDER);
        require(msg.value >= LimitOrderGas.SWAP_MIN_VALUE, LimitOrderErrors.VALUE_TOO_LOW);
        
        tvm.rawReserve(math.max(address(this).balance - msg.value, LimitOrderGas.SWAP_MIN_VALUE), 0);
        swapAttempt++;
        changeState(LimitOrderStatus.SwapInProgress);
         
        TvmBuilder successBuilder;
        successBuilder.store(LimitOrderOperationStatus.SUCCESS);
        successBuilder.store(swapAttempt);
        successBuilder.store(msg.sender);
        successBuilder.store(deployWalletValue);

        TvmBuilder cancelBuilder;
        cancelBuilder.store(LimitOrderOperationStatus.CANCEL);
        cancelBuilder.store(swapAttempt);

        TvmBuilder builder;
        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(swapAttempt);
        builder.store(uint128(0));
        builder.store(currentAmountReceiveToken);

        builder.store(successBuilder);
        builder.store(cancelBuilder);

        ITokenWallet(spentWallet).transfer {
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

    function changeState(uint8 newState) private {
        uint8 prevState = state;
        state = newState;
        emit LimitOrderStateChanged(prevState, newState, builderDetails());    
    }

    function builderDetails() private view returns(LimitOrderDetails){
        return LimitOrderDetails(
            limitOrdersRoot,
            ownerAddress,
            backendPubKey,
            dexRoot,
            dexPair,
            msg.sender,
            swapAttempt,

            state,

            spentTokenRoot,
            receiveTokenRoot,

            spentWallet,
            receiveWallet,

            expectedAmount,
            initialAmount,

            currentAmountSpentToken,
            currentAmountReceiveToken
        );
    }

    function closeLimitOrder() internal onlyLimitOrderOwner { //?
         require(
            state == LimitOrderStatus.Filled || state == LimitOrderStatus.Cancelled, 
            LimitOrderErrors.NOT_FILLED_OR_CANCEL_STATUS_LIMIT_OEDER
        );

        TvmBuilder builder;
        builder.store(factoryOrderRoot);
        
        if (state == LimitOrderStatus.Filled) {
            builder.store("Filled");
        } else {
            builder.store("Cancelled");
        }

        TvmCell saltNewCode = tvm.setCodeSalt (
            limitOrderCodeClosed, 
            builder.toCell()
        );

        tvm.setcode(saltNewCode);
        tvm.setCurrentCode(saltNewCode);

        TvmCell data = abi.encode(     
            state, 
			spentWallet,
            ownerAddress,
            currentAmountSpentToken,

            timeTx,
			nowTx,
			factoryOrderRoot,
			limitOrdersRoot,
			
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

    function onCodeUpgrade(TvmCell data) private {}
}
