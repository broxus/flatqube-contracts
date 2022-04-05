pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrdersGas.sol";
import "./libraries/LimitOrdersErrors.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/LimitOrderOperationStatus.sol";

import "./interfaces/ILimitOrder.sol";
import "./interfaces/IDexRoot.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "./abstract/DexContractBase.sol";

contract LimitOrder is IAcceptTokensTransferCallback, ILimitOrder {
    uint64 static timeTx;
    uint64 static nowTx;
    address static limitOrderAddress;
    address static ownerAddress;
    address static tokenRoot1;
    address static tokenRoot2;

    uint128 expectedAmount;
    uint128 initialAmount;
    uint128 currentAmount;

    uint256 backendPubKey;
    address dexRoot;
    address dexPair;

    address tokenWallet1;
    address tokenWallet2;

    TvmCell limitOrderCodeCancel;

    LimitOrderStatus state;

    constructor(
        uint128 expectedAmount_,
        uint128 initialAmount_,
        uint256 backendPubKey_,
        address dexRoot_,
        TvmCell limitOrderCodeCancel_
    ) public {
        state = LimitOrderStatus.Initialize;
        optional(TvmCell) optSalt = tvm.codeSalt(tvm.code());
        require(optSalt.hasValue(), LimitOrdersErrors.EMPTY_SALT_IN_ORDER);
        (address limitOrdersRootSalt, address tokenRootSalt) = optSalt
            .get()
            .toSlice()
            .decode(address, address);

        if (
            limitOrdersRootSalt == limitOrderAddress &&
            tokenRootSalt == tokenRoot2 &&
            msg.sender.value != 0 &&
            msg.sender == limitOrderAddress
        ) {
            tvm.rawReserve(address(this).balance - msg.value, 0); //???
            
            expectedAmount = expectedAmount_;
            initialAmount = initialAmount_;
            currentAmount = expectedAmount;
            backendPubKey = backendPubKey_;
            dexRoot = dexRoot_;
            limitOrderCodeCancel = limitOrderCodeCancel_;

            IDexRoot(dexRoot).getExpectedPairAddress{
                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MessageFlags.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                tokenRoot1,
                tokenRoot2
            );

            ITokenRoot(rootToken1).deployWallet{
                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                address(this), 
                LimitOrdersGas.DEPLOY_EMPTY_WALLET_GRAMS
            );

            ITokenRoot(rootToken2).deployWallet{
                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: LimitOrder.getBeginData
            }(
                address(this),
                LimitOrdersGas.DEPLOY_EMPTY_WALLET_GRAMS
            );
        } else {
            msg.sender.transfer(
                0,
                false,
                MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            );
        }
    }

    function buildDirectExchangePayload
    (
        uint128 deployWalletValue
    ) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(deployWalletValue);
        return builder.toCell();
    }

    // function buildSwapExchangePayload(
    //     //!!!
    // ) external pure returns (TvmCell) {
    //     TvmBuilder builder;
    //     //!!!
    //     return builder.toCell();
    // }

    modifier onlyLimitOrderOwner() {
        require(
            msg.sender.value != 0 && msg.sender == ownerAddress,
            LimitOrdersErrors.NOT_LIMITS_ORDER_OWNER
        );
        _;
    }

    function getBeginData(address inAddress) external {
        require(
            msg.sender.value != 0 &&
                (msg.sender == dexRoot ||
                    msg.sender == rootToken1 ||
                    msg.sender == rootToken2),
            LimitOrdersErrors.NOT_BEGIN_DATA
        );

        if (msg.sender == dexRoot) {
            dexPair == inAddress;
        } else if (msg.sender == rootToken1) {
            tokenWallet1 = inAddress;
        } else if (msg.sender == rootToken2) {
            tokenWallet2 = inAddress;
        }

        if (
            dexPair != address.makeAddrStd(0, 0) &&
            tokenWallet1 != address.makeAddrStd(0, 0) &&
            tokenWallet2 != address.makeAddrStd(0, 0)
        ) {
            ITokenWallet(rootToken2).balance{
                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MessageFlags.SENDER_PAYS_FEES,
                callback: LimitOrder.getBalanceTokenWallet2
            }(address(this));
        }
    }

    function getBalanceTokenWallet2(uint128 _balance) external {
        require(
            msg.sender.value != 0 && msg.sender == tokenWallet2,
            LimitOrdersErrors.NOT_WALLET_TOKEN_2
        );
        if (_balance == expectedAmount) {
            state = LimitOrderStatus.Active;
        } else {
            state = LimitOrderStatus.AwaitTokens;
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

        if (tokenRoot = tokenRoot2) {
            if (state = LimitOrderStatus.AwaitTokens && amount == expectedAmount) {
                state = LimitOrderStatus.Active;
            } else if (state == LimitOrderStatus.Active) {
                TvmSlice payloadSlice = payload.toSlice();
                if (payloadSlice.bits() >= 128 ) {
                    (uint128 deployWalletValue) = payloadSlice.decode(uint128);
                    if (msg.value >= LimitOrdersGas.TARGET_BALANCE + deployWalletValue) {
                        if (amount > currentAmount) {
                            tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0); //!!!

                            ITokenWallet(msg.sender).transfer {
                                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE, 
                                flag: MsgFlag.SENDER_PAYS_FEES,
                                bounce: false
                            }(
                                amount - currentAmount,
                                sender,
                                0,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            ITokenWallet(tokenRoot1).transfer {
                                value: LimitOrdersGas.DEPLOY_EMPTY_WALLET_VALUE,
                                flag: MsgFlag.SENDER_PAYS_FEES,
                                bounce: false
                            }(
                                math.muldiv(amount, initialAmount, expectedAmount),
                                msg.sender,
                                deployWalletValue,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            ITokenWallet(tokenRoot2).transfer {
                                value: 0,
                                flag: MsgFlag.ALL_NOT_RESERVED,
                                bounce: false
                            }(
                                currentAmount,
                                ownerAddress,
                                0,
                                originalGasTo,
                                true,
                                emptyPayload
                            );
                            currentAmount = 0;

                        } else {
                            tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0); //!!!

                            ITokenWallet(tokenRoot1).transfer {
                                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
                                flag: MsgFlag.SENDER_PAYS_FEES,
                                bounce: false
                            }(
                                math.muldiv(amount, initialAmount, expectedAmount),
                                msg.sender,
                                deployWalletValue,
                                originalGasTo,
                                true,
                                emptyPayload
                            );

                            ITokenWallet(tookenRoot2).transfer {
                                value: LimitOrderGas.DEPLOY_EMPTY_WALLET_VALUE,
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

                            currentAmount -= amount;
                        }
                    } else {
                        needCancel = true;    
                    }
                } else {
                    needCancel = true;
                }
            } else if (state == LimitOrderStatus.SwapInProgress) {
                tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);
                TvmSlice payloadSlice = payload.toSlice();
                if (payloadSlice.bits() >= 8) {
                    uint8 operationStatus = payloadSlice.decode(uint8);
                    // if (payloadSlice.bits() == 192) {
                    if (operationStatus == LimitOrderOperationStatus.SUCESS) {
                        //success, то разницу скидывать тому, кто вызвал контракт
                    } else if (
                        operationStatus == LimitOrderOperationStatus.CANCEL
                    ) {
                        // не возвращать комиссию!!!
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
            }(amount, sender, uint128(0), original_gas_to, true, emptyPayload);
        }

        if (currentAmount == 0) {
            state = LimitOrderStatus.Filled;
            //!!! Деплоим пустой
        }
    }

    function cancelOrder() external onlyLimitOrderOwner {
        require(state == LimitOrderStatus.Active, LimitOrdersErrors.NOT_ACTIVE_LIMIT_ORDER);
        
        //     tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        //     state = LimitOrderStatus.Cancelled;
        //     TvmCell emptyPayload;
        //     ITokenWallet(tokenWallet1).transfer{
        //         value: 0,
        //         flag: MsgFlag.ALL_NOT_RESERVED,
        //         bounce: false
        //     }(
        //         currentAmount,
        //         ownerAddress,
        //         0,
        //         true,
        //         emptyPayload
        //     );
        //     // Деактивация или удаление лимитного ордера ->>>        // }
    }

    function backLimitOrderSwap() external {
        require(msg.pubkey() == backendPubKey, LimitOrdersErrors.NOT_BACKEND_PUB_KEY);
        require(state == LimitOrderStatus.Active, LimitOrdersErrors.NOT_ACTIVE_LIMIT_ORDER);

        tvm.accept();
        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);

        state = LimitOrderStatus.SwapInProgress;
         
        TvmBuilder successBuilder;
        successBuilder.store(LimitOrderOperationStatus.SUCESS);

        TvmBuilder cancelBuilder;
        cancelBuilder.store(LimitOrderOperationStatus.CANCEL);

        TvmBuilder builder;
        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(uint128(0)); // id
        builder.store(uint128(0)); //deployWalletValue
        builder.store(currentAmount);

        builder.store(successBuilder);
        builder.store(cancelBuilder);

        ITokenWallet(tokenRoot1).transfer{
            value: LimitOrdersGas.SWAP_BACK_MIN_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(
            currentAmount,
            dexPair,
            uint128(0),
            address(this),
            true,
            builder.toCell()
        );
    }

    function limitOrderSwap() external {
        require(state == LimitOrderStatus.Active, LimitOrdersErrors.NOT_ACTIVE_LIMIT_ORDER);
        require(SWAP_MIN_VALUE, LimitOrdersErrors.VALUE_TOO_LOW);
        
        tvm.rawReserve(LimitOrdersGas.SWAP_MIN_VALUE, 0);
        state = LimitOrderStatus.SwapInProgress;
         
        TvmBuilder successBuilder;
        successBuilder.store(LimitOrderOperationStatus.SUCESS);

        TvmBuilder cancelBuilder;
        cancelBuilder.store(LimitOrderOperationStatus.CANCEL);

        TvmBuilder builder;
        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(uint128(0)); // id
        builder.store(uint128(0)); //deployWalletValue
        builder.store(currentAmount);

        builder.store(successBuilder);
        builder.store(cancelBuilder);

        // ITokenWallet(tokenRoot1).transfer{
        //     value: LimitOrdersGas.SWAP_BACK_MIN_VALUE,
        //     flag: MsgFlag.SENDER_PAYS_FEES
        // }(
        //     currentAmount,
        //     dexPair,
        //     uint128(0),
        //     address(this),
        //     true,
        //     builder.toCell()
        // );
    }
}
