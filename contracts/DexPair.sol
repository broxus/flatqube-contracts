pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IBurnableByRootTokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IBurnableTokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "./abstract/DexPairBase.sol";

import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexPair.sol";
import "./interfaces/ISuccessCallback.sol";
import "./interfaces/IDexPairOperationCallback.sol";

import "./libraries/DexPlatformTypes.sol";
import "./libraries/DexErrors.sol";
import "./libraries/Math.sol";
import "./libraries/PairPayload.sol";

import "./structures/IExchangeResult.sol";
import "./structures/IWithdrawResult.sol";

import "./DexPlatform.sol";

contract DexPair is DexPairBase {
    // Cant be deployed directly
    constructor() public {
        revert();
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Direct operations

    function buildExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount
    ) external pure returns (TvmCell) {
        return PairPayload.buildExchangePayload(
            id,
            deploy_wallet_grams,
            expected_amount
        );
    }

    function buildDepositLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams
    ) external pure returns (TvmCell) {
        return PairPayload.buildDepositLiquidityPayload(
            id,
            deploy_wallet_grams
        );
    }

    function buildWithdrawLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams
    ) external pure returns (TvmCell) {
        return PairPayload.buildWithdrawLiquidityPayload(
            id,
            deploy_wallet_grams
        );
    }

    function buildCrossPairExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        TokenOperation[] steps
    ) external pure returns (TvmCell) {
        return PairPayload.buildCrossPairExchangePayload(
            id,
            deploy_wallet_grams,
            expected_amount,
            steps
        );
    }

    function onAcceptTokensTransfer(
        address _tokenRoot,
        uint128 _tokensAmount,
        address _senderAddress,
        address _senderWallet,
        address _remainingGasTo,
        TvmCell _payload
    ) override external {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        (
            bool isValid,
            uint64 id,
            uint8 op,
            uint128 deployWalletGrams,
            uint128 expectedAmount,
            address nextTokenRoot,
            bool hasRef3,
            TvmCell ref3,
            bool notifySuccess,
            TvmCell successPayload,
            bool notifyCancel,
            TvmCell cancelPayload
        ) = PairPayload.decodeOnAcceptTokensTransferPayload(_payload);

        TvmCell empty;

        bool needCancel = !_active || !isValid || _typeToReserves[DexReserveType.LP][0] == 0;

        if (!needCancel) {
            address vault = _typeToRootAddresses[DexAddressType.VAULT][0];
            address lp = _typeToRootAddresses[DexAddressType.LP][0];

            if (
                (_tokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0] || _tokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][1]) &&
                (msg.sender == _typeToWalletAddresses[DexAddressType.RESERVE][0] || msg.sender == _typeToWalletAddresses[DexAddressType.RESERVE][1]) &&
                msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deployWalletGrams
            ) {
                bool isLeftToRight = _tokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0];
                address fromTokenVault = isLeftToRight ? _typeToWalletAddresses[DexAddressType.VAULT][0] : _typeToWalletAddresses[DexAddressType.VAULT][1];
                address toTokenVault = isLeftToRight ? _typeToWalletAddresses[DexAddressType.VAULT][1] : _typeToWalletAddresses[DexAddressType.VAULT][0];
                address fromTokenRoot = isLeftToRight ? _typeToRootAddresses[DexAddressType.RESERVE][0] : _typeToRootAddresses[DexAddressType.RESERVE][1];
                address toTokenRoot = isLeftToRight ? _typeToRootAddresses[DexAddressType.RESERVE][1] : _typeToRootAddresses[DexAddressType.RESERVE][0];
                uint128 fromReserve = isLeftToRight ? _typeToReserves[DexReserveType.POOL][0] : _typeToReserves[DexReserveType.POOL][1];
                uint128 toReserve = isLeftToRight ? _typeToReserves[DexReserveType.POOL][1] : _typeToReserves[DexReserveType.POOL][0];
                uint128 lpReserve = _typeToReserves[DexReserveType.LP][0];

                if (op == DexOperationTypes.EXCHANGE) {
                    (
                        uint128 amount,
                        uint128 poolFee,
                        uint128 beneficiaryFee
                    ) = _expectedExchange(
                        _tokensAmount,
                        fromReserve,
                        toReserve
                    );

                    if (
                        amount <= toReserve &&
                        amount >= expectedAmount &&
                        amount > 0 &&
                        (poolFee > 0 || _fee.pool_numerator == 0) &&
                        (beneficiaryFee > 0 || _fee.beneficiary_numerator == 0)
                    ) {
                        if (isLeftToRight) {
                            _typeToReserves[DexReserveType.POOL][0] += _tokensAmount - beneficiaryFee;
                            _typeToReserves[DexReserveType.POOL][1] -= amount;
                        } else {
                            _typeToReserves[DexReserveType.POOL][1] += _tokensAmount - beneficiaryFee;
                            _typeToReserves[DexReserveType.POOL][0] -= amount;
                        }

                        ExchangeFee[] fees;

                        fees.push(
                            ExchangeFee(
                                fromTokenRoot,
                                poolFee,
                                beneficiaryFee,
                                _fee.beneficiary
                            )
                        );

                        emit Exchange(
                            _senderAddress,
                            _senderAddress,
                            fromTokenRoot,
                            _tokensAmount,
                            toTokenRoot,
                            amount,
                            fees
                        );

                        if (beneficiaryFee > 0) {
                            if (isLeftToRight) {
                                _typeToReserves[DexReserveType.FEE][0] += beneficiaryFee;
                            } else {
                                _typeToReserves[DexReserveType.FEE][1] += beneficiaryFee;
                            }

                            _processBeneficiaryFees(false, _remainingGasTo);
                        }

                        IDexPairOperationCallback(_senderAddress)
                            .dexPairExchangeSuccess{
                                value: DexGas.OPERATION_CALLBACK_BASE + 10,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(
                                id,
                                false,
                                IExchangeResult.ExchangeResult(
                                    true,
                                    _tokensAmount,
                                    poolFee + beneficiaryFee,
                                    amount
                                )
                            );

                        ITokenWallet(msg.sender)
                            .transfer{ value: DexGas.TRANSFER_TOKENS_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                            (
                                _tokensAmount,
                                vault,
                                0,
                                _remainingGasTo,
                                false,
                                empty
                            );

                        IDexVault(vault)
                            .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                            (
                                amount,
                                toTokenRoot,
                                toTokenVault,
                                _senderAddress,
                                deployWalletGrams,
                                notifySuccess,
                                successPayload,
                                fromTokenRoot,
                                toTokenRoot,
                                _currentVersion,
                                _remainingGasTo
                            );
                    } else {
                        needCancel = true;
                    }
                } else if (op == DexOperationTypes.DEPOSIT_LIQUIDITY) {
                    (
                        DepositLiquidityResult r,
                        uint128 step2PoolFee,
                        uint128 step2BeneficiaryFee
                    ) = _expectedDepositLiquidity(
                        _tokensAmount,
                        0,
                        true,
                        fromReserve,
                        toReserve,
                        lpReserve
                    );

                    if (
                        r.step_3_lp_reward > 0 &&
                        r.step_2_received <= toReserve &&
                        r.step_2_received > 0 &&
                        (step2PoolFee > 0 || _fee.pool_numerator == 0) &&
                        (step2BeneficiaryFee > 0 || _fee.beneficiary_numerator == 0)
                    ) {
                        _typeToReserves[DexReserveType.LP][0] += r.step_3_lp_reward;

                        if (isLeftToRight) {
                            _typeToReserves[DexReserveType.POOL][0] += _tokensAmount - step2BeneficiaryFee;
                        } else {
                            _typeToReserves[DexReserveType.POOL][1] += _tokensAmount - step2BeneficiaryFee;
                        }

                        if (step2BeneficiaryFee > 0) {
                            if (isLeftToRight) {
                                _typeToReserves[DexReserveType.FEE][0] += step2BeneficiaryFee;
                            } else {
                                _typeToReserves[DexReserveType.FEE][1] += step2BeneficiaryFee;
                            }

                            _processBeneficiaryFees(false, _remainingGasTo);
                        }

                        ExchangeFee[] fees;

                        fees.push(
                            ExchangeFee(
                                fromTokenRoot,
                                step2PoolFee,
                                step2BeneficiaryFee,
                                _fee.beneficiary
                            )
                        );

                        emit Exchange(
                            _senderAddress,
                            _senderAddress,
                            fromTokenRoot,
                            r.step_2_spent,
                            toTokenRoot,
                            r.step_2_received,
                            fees
                        );

                        TokenOperation[] operations = new TokenOperation[](0);

                        operations.push(
                            TokenOperation(
                                r.step_3_left_deposit,
                                fromTokenRoot
                            )
                        );

                        operations.push(
                            TokenOperation(
                                r.step_3_right_deposit,
                                toTokenRoot
                            )
                        );

                        emit DepositLiquidity(
                            _senderAddress,
                            _senderAddress,
                            operations,
                            r.step_3_lp_reward
                        );

                        IDexPairOperationCallback(_senderAddress)
                            .dexPairDepositLiquiditySuccess{
                                value: DexGas.OPERATION_CALLBACK_BASE + 20,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(id, false, r);

                        ITokenWallet(msg.sender)
                            .transfer{ value: DexGas.TRANSFER_TOKENS_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                            (
                                _tokensAmount,
                                vault,
                                0,
                                _remainingGasTo,
                                false,
                                empty
                            );

                        ITokenRoot(lp)
                            .mint{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                            (
                                r.step_3_lp_reward,
                                _senderAddress,
                                deployWalletGrams,
                                _remainingGasTo,
                                notifySuccess,
                                successPayload
                            );
                    } else {
                        needCancel = true;
                    }
                } else if (
                    op == DexOperationTypes.CROSS_PAIR_EXCHANGE &&
                    notifySuccess &&
                    successPayload.toSlice().bits() >= 128
                ) {
                    (
                        uint128 amount,
                        uint128 poolFee,
                        uint128 beneficiaryFee
                    ) = _expectedExchange(
                        _tokensAmount,
                        fromReserve,
                        toReserve
                    );

                    if (
                        amount <= toReserve &&
                        amount >= expectedAmount &&
                        amount > 0 &&
                        (poolFee > 0 || _fee.pool_numerator == 0) &&
                        (beneficiaryFee > 0 || _fee.beneficiary_numerator == 0) &&
                        nextTokenRoot.value != 0 &&
                        nextTokenRoot != toTokenRoot &&
                        nextTokenRoot != fromTokenRoot
                    ) {
                        if (isLeftToRight) {
                            _typeToReserves[DexReserveType.POOL][0] += _tokensAmount - beneficiaryFee;
                            _typeToReserves[DexReserveType.POOL][1] -= amount;
                        } else {
                            _typeToReserves[DexReserveType.POOL][1] += _tokensAmount - beneficiaryFee;
                            _typeToReserves[DexReserveType.POOL][0] -= amount;
                        }

                        ExchangeFee[] fees;

                        fees.push(
                            ExchangeFee(
                                fromTokenRoot,
                                poolFee,
                                beneficiaryFee,
                                _fee.beneficiary
                            )
                        );

                        emit Exchange(
                            _senderAddress,
                            _senderAddress,
                            fromTokenRoot,
                            _tokensAmount,
                            toTokenRoot,
                            amount,
                            fees
                        );

                        if (beneficiaryFee > 0) {
                            if (isLeftToRight) {
                                _typeToReserves[DexReserveType.FEE][0] += beneficiaryFee;
                            } else {
                                _typeToReserves[DexReserveType.FEE][1] += beneficiaryFee;
                            }

                            _processBeneficiaryFees(false, _remainingGasTo);
                        }

                        IDexPairOperationCallback(_senderAddress)
                            .dexPairExchangeSuccess{
                                value: DexGas.OPERATION_CALLBACK_BASE + 40,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(
                                id,
                                false,
                                IExchangeResult.ExchangeResult(
                                    true,
                                    _tokensAmount,
                                    poolFee + beneficiaryFee,
                                    amount
                                )
                            );

                        ITokenWallet(msg.sender)
                            .transfer{ value: DexGas.TRANSFER_TOKENS_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                            (
                                _tokensAmount,
                                vault,
                                0,
                                _remainingGasTo,
                                false,
                                empty
                            );

                        address nextPair = _expectedPairAddress(toTokenRoot, nextTokenRoot);

                        IDexPair(nextPair)
                            .crossPoolExchange{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                            (
                                id,
                                _currentVersion,
                                DexPoolTypes.CONSTANT_PRODUCT,
                                _tokenRoots(),
                                toTokenRoot,
                                amount,
                                _senderAddress,
                                _remainingGasTo,
                                deployWalletGrams,
                                successPayload,    // actually it is next_payload
                                notifyCancel,      // actually it is notify_success
                                cancelPayload,     // actually it is success_payload
                                hasRef3,            // actually it is notify_success
                                ref3                // actually it is cancel_payload
                            );
                    } else {
                        needCancel = true;
                    }
                } else {
                    needCancel = true;
                }
            } else if (
                op == DexOperationTypes.WITHDRAW_LIQUIDITY &&
                _tokenRoot == lp &&
                msg.sender == _typeToWalletAddresses[DexAddressType.LP][0] &&
                msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + 2 * deployWalletGrams
            ) {
                TokenOperation[] operations = _withdrawLiquidityBase(_tokensAmount, _senderAddress);

                IDexPairOperationCallback(_senderAddress)
                    .dexPairWithdrawSuccess{
                        value: DexGas.OPERATION_CALLBACK_BASE + 30,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(
                        id,
                        false,
                        IWithdrawResult.WithdrawResult(
                            _tokensAmount,
                            operations[0].amount,
                            operations[1].amount
                        )
                    );

                if(operations[0].amount > 0) {
                    IDexVault(vault)
                        .transfer{ value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deployWalletGrams, flag: MsgFlag.SENDER_PAYS_FEES }
                        (
                            operations[0].amount,
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToWalletAddresses[DexAddressType.VAULT][0],
                            _senderAddress,
                            deployWalletGrams,
                            notifySuccess,
                            successPayload,
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _currentVersion,
                            _remainingGasTo
                        );
                }

                if(operations[1].amount > 0) {
                    IDexVault(vault)
                        .transfer{ value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deployWalletGrams, flag: MsgFlag.SENDER_PAYS_FEES }
                        (
                            operations[1].amount,
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _typeToWalletAddresses[DexAddressType.VAULT][1],
                            _senderAddress,
                            deployWalletGrams,
                            notifySuccess,
                            successPayload,
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _currentVersion,
                            _remainingGasTo
                        );
                }

                IBurnableTokenWallet(msg.sender)
                    .burn{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                    (
                        _tokensAmount,
                        _remainingGasTo,
                        address.makeAddrStd(0, 0),
                        empty
                    );
            } else {
                needCancel = true;
            }
        }

        if (needCancel) {
            IDexPairOperationCallback(_senderAddress)
                .dexPairOperationCancelled{
                    value: DexGas.OPERATION_CALLBACK_BASE + 44,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id);

            ITokenWallet(msg.sender)
                .transferToWallet{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    _tokensAmount,
                    _senderWallet,
                    _remainingGasTo,
                    notifyCancel,
                    cancelPayload
                );
        } else {
            _sync();
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deposit liquidity

    function expectedDepositLiquidity(
        uint128 left_amount,
        uint128 right_amount,
        bool auto_change
    ) override external view responsible returns (DepositLiquidityResult) {
        uint128 lpReserve = _typeToReserves[DexReserveType.LP][0];

        if (lpReserve == 0) {
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } DepositLiquidityResult(
                left_amount,
                right_amount,
                math.max(left_amount, right_amount),
                false, false, 0, 0, 0, 0, 0, 0
            );
        } else {
            (DepositLiquidityResult r,,) = _expectedDepositLiquidity(
                left_amount,
                right_amount,
                auto_change,
                _typeToReserves[DexReserveType.POOL][0],
                _typeToReserves[DexReserveType.POOL][1],
                lpReserve
            );

            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } r;
        }
    }

    function depositLiquidity(
        uint64 _callId,
        uint128 _leftAmount,
        uint128 _rightAmount,
        address _expectedLpRoot,
        bool _autoChange,
        address _accountOwner,
        uint32,
        address _remainingGasTo
    ) override external onlyActive onlyAccount(_accountOwner) {
        require(_expectedLpRoot == _typeToRootAddresses[DexAddressType.LP][0], DexErrors.NOT_LP_TOKEN_ROOT);
        require(_typeToReserves[DexReserveType.LP][0] != 0 || (_leftAmount > 0 && _rightAmount > 0), DexErrors.WRONG_LIQUIDITY);
        require(
            (_leftAmount > 0 && _rightAmount > 0) ||
            (_autoChange && (_leftAmount + _rightAmount > 0)),
            DexErrors.AMOUNT_TOO_LOW
        );
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        uint128 lpTokensAmount;

        if (_typeToReserves[DexReserveType.LP][0] == 0) {
            lpTokensAmount = math.max(_leftAmount, _rightAmount);
            _typeToReserves[DexReserveType.POOL][0] = _leftAmount;
            _typeToReserves[DexReserveType.POOL][1] = _rightAmount;

            TokenOperation[] operations = new TokenOperation[](0);

            operations.push(
                TokenOperation(
                    _leftAmount,
                    _typeToRootAddresses[DexAddressType.RESERVE][0]
                )
            );

            operations.push(
                TokenOperation(
                    _rightAmount,
                    _typeToRootAddresses[DexAddressType.RESERVE][1]
                )
            );

            emit DepositLiquidity(
                _accountOwner,
                _accountOwner,
                operations,
                lpTokensAmount
            );

            IDexPairOperationCallback(_accountOwner)
                .dexPairDepositLiquiditySuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 2,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(
                    _callId,
                    true,
                    DepositLiquidityResult(
                        _leftAmount,
                        _rightAmount,
                        lpTokensAmount,
                        false,
                        false,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0
                    )
                );
        } else {
            (
                DepositLiquidityResult r,
                uint128 step2PoolFee,
                uint128 step2BeneficiaryFee
            ) = _expectedDepositLiquidity(
                _leftAmount,
                _rightAmount,
                _autoChange,
                _typeToReserves[DexReserveType.POOL][0],
                _typeToReserves[DexReserveType.POOL][1],
                _typeToReserves[DexReserveType.LP][0]
            );

            lpTokensAmount = r.step_1_lp_reward + r.step_3_lp_reward;

            if (_autoChange) {
                _typeToReserves[DexReserveType.POOL][0] += _leftAmount;
                _typeToReserves[DexReserveType.POOL][1] += _rightAmount;

                if (r.step_2_right_to_left) {
                    require(r.step_2_received <= _typeToReserves[DexReserveType.POOL][0] + r.step_1_left_deposit, DexErrors.NOT_ENOUGH_FUNDS);

                    _typeToReserves[DexReserveType.POOL][1] -= step2BeneficiaryFee;
                    _typeToReserves[DexReserveType.FEE][1] += step2BeneficiaryFee;
                } else if (r.step_2_left_to_right) {
                    require(r.step_2_received <= _typeToReserves[DexReserveType.POOL][1] + r.step_1_right_deposit, DexErrors.NOT_ENOUGH_FUNDS);

                    _typeToReserves[DexReserveType.POOL][0] -= step2BeneficiaryFee;
                    _typeToReserves[DexReserveType.FEE][0] += step2BeneficiaryFee;
                }

                if (step2BeneficiaryFee > 0) {
                    _processBeneficiaryFees(false, _remainingGasTo);
                }
            } else {
                _typeToReserves[DexReserveType.POOL][0] += r.step_1_left_deposit;
                _typeToReserves[DexReserveType.POOL][1] += r.step_1_right_deposit;

                if (r.step_1_left_deposit < _leftAmount) {
                    IDexAccount(msg.sender)
                        .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                        (
                            _leftAmount - r.step_1_left_deposit,
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _remainingGasTo
                        );
                }

                if (r.step_1_right_deposit < _rightAmount) {
                    IDexAccount(msg.sender)
                        .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                        (
                            _rightAmount - r.step_1_right_deposit,
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _typeToRootAddresses[DexAddressType.RESERVE][0],
                            _typeToRootAddresses[DexAddressType.RESERVE][1],
                            _remainingGasTo
                        );
                }
            }

            if (r.step_1_lp_reward > 0) {
                TokenOperation[] step1Operations;

                step1Operations.push(
                    TokenOperation(
                        r.step_1_left_deposit,
                        _typeToRootAddresses[DexAddressType.RESERVE][0]
                    )
                );

                step1Operations.push(
                    TokenOperation(
                        r.step_1_right_deposit,
                        _typeToRootAddresses[DexAddressType.RESERVE][1]
                    )
                );

                emit DepositLiquidity(
                    _accountOwner,
                    _accountOwner,
                    step1Operations,
                    r.step_1_lp_reward
                );
            }

            ExchangeFee[] fees;

            if (r.step_2_right_to_left) {
                fees.push(
                    ExchangeFee(
                        _typeToRootAddresses[DexAddressType.RESERVE][1],
                        step2PoolFee,
                        step2BeneficiaryFee,
                        _fee.beneficiary
                    )
                );

                emit Exchange(
                    _accountOwner,
                    _accountOwner,
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    r.step_2_spent,
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    r.step_2_received,
                    fees
                );
            } else if (r.step_2_left_to_right) {
                fees.push(
                    ExchangeFee(
                        _typeToRootAddresses[DexAddressType.RESERVE][0],
                        step2PoolFee,
                        step2BeneficiaryFee,
                        _fee.beneficiary
                    )
                );

                emit Exchange(
                    _accountOwner,
                    _accountOwner,
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    r.step_2_spent,
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    r.step_2_received,
                    fees
                );
            }

            if (r.step_3_lp_reward > 0) {
                TokenOperation[] step3Operations;

                step3Operations.push(
                    TokenOperation(
                        r.step_3_left_deposit,
                        _typeToRootAddresses[DexAddressType.RESERVE][0]
                    )
                );

                step3Operations.push(
                    TokenOperation(
                        r.step_3_right_deposit,
                        _typeToRootAddresses[DexAddressType.RESERVE][1]
                    )
                );

                emit DepositLiquidity(
                    _accountOwner,
                    _accountOwner,
                    step3Operations,
                    r.step_3_lp_reward
                );
            }

            IDexPairOperationCallback(_accountOwner)
                .dexPairDepositLiquiditySuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 2,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(_callId, true, r);

        }

        _typeToReserves[DexReserveType.LP][0] += lpTokensAmount;

        TvmCell empty;

        ITokenRoot(_typeToRootAddresses[DexAddressType.LP][0])
            .mint{ value: DexGas.DEPLOY_MINT_VALUE_BASE + DexGas.DEPLOY_EMPTY_WALLET_GRAMS, flag: MsgFlag.SENDER_PAYS_FEES }
            (
                lpTokensAmount,
                _accountOwner,
                DexGas.DEPLOY_EMPTY_WALLET_GRAMS,
                _remainingGasTo,
                _remainingGasTo == _accountOwner,
                empty
            );

        _sync();

        ISuccessCallback(msg.sender)
            .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_callId);
    }

    function _expectedDepositLiquidity(
        uint128 _leftAmount,
        uint128 _rightAmount,
        bool _autoChange,
        uint128 _fromReserve,
        uint128 _toReserve,
        uint128 _lpReserve
    ) private view returns (
        DepositLiquidityResult,
        uint128,
        uint128
    ) {
        // step 1 (first deposit)
        uint128 step1LeftDeposit = 0;
        uint128 step1RightDeposit = 0;
        uint128 step1LpReward = 0;

        if (_leftAmount > 0 && _rightAmount > 0) {
            step1LeftDeposit = math.min(
                _leftAmount,
                math.muldiv(_fromReserve, _rightAmount, _toReserve)
            );

            step1RightDeposit = math.min(
                _rightAmount,
                math.muldiv(_toReserve, _leftAmount, _fromReserve)
            );

            step1LpReward = math.max(
                math.muldiv(step1RightDeposit, _lpReserve, _toReserve),
                math.muldiv(step1LeftDeposit, _lpReserve, _fromReserve)
            );
        }

        uint128 currentLeftAmount = _leftAmount - step1LeftDeposit;
        uint128 currentRightAmount = _rightAmount - step1RightDeposit;
        uint128 currentLeftBalance = _fromReserve + step1LeftDeposit;
        uint128 currentRightBalance = _toReserve + step1RightDeposit;
        uint128 currentLpSupply = _lpReserve + step1LpReward;

        bool step2LeftToRight = false;
        bool step2RightToLeft = false;
        uint128 step2Spent = 0;
        uint128 step2PoolFee = 0;
        uint128 step2BeneficiaryFee = 0;
        uint128 step2Received = 0;

        uint128 step3LeftDeposit = 0;
        uint128 step3RightDeposit = 0;
        uint128 step3LpReward = 0;

        uint256 feeD = uint256(_fee.denominator);
        uint256 feeDMinusN = feeD - uint256(_fee.pool_numerator + _fee.beneficiary_numerator);
        uint256 denominator = feeDMinusN * (feeD - uint256(_fee.beneficiary_numerator));

        if (_autoChange && currentRightAmount > 0) {
            // step 2 (surplus RIGHT exchange)
            step2RightToLeft = true;

            uint256 p = math.muldiv(
                uint256(currentRightBalance),
                feeD * (feeDMinusN + feeD),
                denominator
            );

            uint256 q = math.muldiv(
                uint256(currentRightBalance),
                feeD * feeD * uint256(currentRightAmount),
                denominator
            );

            step2Spent = Math.solveQuadraticEquationPQ(p, q);

            (
                step2Received,
                step2PoolFee,
                step2BeneficiaryFee
            ) = _expectedExchange(
                step2Spent,
                currentRightBalance,
                currentLeftBalance
            );

            currentRightAmount = currentRightAmount - step2Spent;
            currentRightBalance = currentRightBalance + step2Spent - step2BeneficiaryFee;

            if (currentRightAmount > 0 && step2Received > 0) {
                // step 3 (deposit exchanged amounts)
                step3RightDeposit = currentRightAmount;
                step3LeftDeposit = step2Received;

                step3LpReward = math.muldiv(currentRightAmount, currentLpSupply, currentRightBalance);
            } else {
                step2RightToLeft = false;
                step1RightDeposit = _rightAmount;
            }
        } else if (_autoChange && currentLeftAmount > 0) {
            // step 2 (surplus LEFT exchange)
            step2LeftToRight = true;

            uint256 p = math.muldiv(
                uint256(currentLeftBalance),
                feeD * (feeDMinusN + feeD),
                denominator
            );

            uint256 q = math.muldiv(
                uint256(currentLeftBalance),
                feeD * feeD * uint256(currentLeftAmount),
                denominator
            );

            step2Spent = Math.solveQuadraticEquationPQ(p, q);

            (
                step2Received,
                step2PoolFee,
                step2BeneficiaryFee
            ) = _expectedExchange(
                step2Spent,
                currentLeftBalance,
                currentRightBalance
            );

            currentLeftAmount = currentLeftAmount - step2Spent;
            currentLeftBalance = currentLeftBalance + step2Spent - step2BeneficiaryFee;

            if (currentLeftAmount > 0 && step2Received > 0) {
                // step 3 (deposit exchanged amounts)
                step3LeftDeposit = currentLeftAmount;
                step3RightDeposit = step2Received;

                step3LpReward = math.muldiv(currentLeftAmount, currentLpSupply, currentLeftBalance);
            } else {
                step2LeftToRight = false;
                step1LeftDeposit = _leftAmount;
            }
        }

        return (
            DepositLiquidityResult(
                step1LeftDeposit,
                step1RightDeposit,
                step1LpReward,

                step2LeftToRight,
                step2RightToLeft,
                step2Spent,
                step2PoolFee + step2BeneficiaryFee,
                step2Received,

                step3LeftDeposit,
                step3RightDeposit,
                step3LpReward
            ),
            step2PoolFee,
            step2BeneficiaryFee
        );
    }

    function _depositLiquidityBase() private {

    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Withdraw liquidity

    function _withdrawLiquidityBase(
        uint128 _lpAmount,
        address _sender
    ) private returns (TokenOperation[]) {
        uint128 leftBackAmount =  math.muldiv(_typeToReserves[DexReserveType.POOL][0], _lpAmount, _typeToReserves[DexReserveType.LP][0]);
        uint128 rightBackAmount = math.muldiv(_typeToReserves[DexReserveType.POOL][1], _lpAmount, _typeToReserves[DexReserveType.LP][0]);

        _typeToReserves[DexReserveType.POOL][0] -= leftBackAmount;
        _typeToReserves[DexReserveType.POOL][1] -= rightBackAmount;
        _typeToReserves[DexReserveType.LP][0] -= _lpAmount;

        TokenOperation[] operations = new TokenOperation[](0);

        operations.push(
            TokenOperation(
                leftBackAmount,
                _typeToRootAddresses[DexAddressType.RESERVE][0]
            )
        );

        operations.push(
            TokenOperation(
                rightBackAmount,
                _typeToRootAddresses[DexAddressType.RESERVE][1]
            )
        );

        emit WithdrawLiquidity(
            _sender,
            _sender,
            _lpAmount,
            operations
        );

        return operations;
    }

    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) override external view responsible returns (
        uint128 expected_left_amount,
        uint128 expected_right_amount
    ) {
        uint128 leftBackAmount = math.muldiv(_typeToReserves[DexReserveType.POOL][0], lp_amount, _typeToReserves[DexReserveType.LP][0]);
        uint128 rightBackAmount = math.muldiv(_typeToReserves[DexReserveType.POOL][1], lp_amount, _typeToReserves[DexReserveType.LP][0]);

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (leftBackAmount, rightBackAmount);
    }

    function withdrawLiquidity(
        uint64 _callId,
        uint128 _lpAmount,
        address _expectedLpRoot,
        address _accountOwner,
        uint32,
        address _remainingGasTo
    ) override external onlyActive onlyAccount(_accountOwner) {
        require(_expectedLpRoot == _typeToRootAddresses[DexAddressType.LP][0], DexErrors.NOT_LP_TOKEN_ROOT);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        TokenOperation[] operations = _withdrawLiquidityBase(_lpAmount, _accountOwner);

        _sync();

        IDexPairOperationCallback(_accountOwner)
            .dexPairWithdrawSuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 3,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(
                _callId,
                true,
                IWithdrawResult.WithdrawResult(
                    _lpAmount,
                    operations[0].amount,
                    operations[1].amount
                )
            );

        for (TokenOperation op : operations) {
            if (op.amount >= 0) {
                IDexAccount(msg.sender)
                    .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                    (
                        op.amount,
                        op.root,
                        _typeToRootAddresses[DexAddressType.RESERVE][0],
                        _typeToRootAddresses[DexAddressType.RESERVE][1],
                        _remainingGasTo
                    );
            }
        }

        TvmCell empty;

        IBurnableByRootTokenRoot(_typeToRootAddresses[DexAddressType.LP][0])
            .burnTokens{ value: DexGas.BURN_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
            (
                _lpAmount,
                _typeToRootAddresses[DexAddressType.VAULT][0],
                _remainingGasTo,
                address.makeAddrStd(0, 0),
                empty
            );

        ISuccessCallback(msg.sender)
            .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_callId);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Exchange

    function expectedExchange(
        uint128 amount,
        address spent_token_root
    ) override external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    ) {
        if (spent_token_root == _typeToRootAddresses[DexAddressType.RESERVE][0]) {
            (
                uint128 rightAmount,
                uint128 leftPoolFee,
                uint128 leftBeneficiaryFee
            ) = _expectedExchange(
                amount,
                _typeToReserves[DexReserveType.POOL][0],
                _typeToReserves[DexReserveType.POOL][1]
            );

            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (
                rightAmount,
                leftPoolFee + leftBeneficiaryFee
            );
        } else if (spent_token_root == _typeToRootAddresses[DexAddressType.RESERVE][1]) {
            (
                uint128 leftAmount,
                uint128 rightPoolFee,
                uint128 rightBeneficiaryFee
            ) = _expectedExchange(
                amount,
                _typeToReserves[DexReserveType.POOL][1],
                _typeToReserves[DexReserveType.POOL][0]
            );

            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (
                leftAmount,
                rightPoolFee + rightBeneficiaryFee
            );
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root
    ) override external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    ) {
        if (receive_token_root == _typeToRootAddresses[DexAddressType.RESERVE][1]) {
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } _expectedSpendAmount(
                receive_amount,
                _typeToReserves[DexReserveType.POOL][0],
                _typeToReserves[DexReserveType.POOL][1]
            );
        } else if (receive_token_root == _typeToRootAddresses[DexAddressType.RESERVE][0]) {
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } _expectedSpendAmount(
                receive_amount,
                _typeToReserves[DexReserveType.POOL][1],
                _typeToReserves[DexReserveType.POOL][0]
            );
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function exchange(
        uint64 _callId,
        uint128 _spentAmount,
        address _spentTokenRoot,
        address _receiveTokenRoot,
        uint128 _expectedAmount,
        address _accountOwner,
        uint32,
        address _remainingGasTo
    ) override external onlyActive onlyAccount(_accountOwner) {
        if (
            (_spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0] && _receiveTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][1]) ||
            (_spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][1] && _receiveTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0])
        ) {
            (
                uint128 rightAmount,
                uint128 leftPoolFee,
                uint128 leftBeneficiaryFee
            ) = _expectedExchange(
                _spentAmount,
                _typeToReserves[DexReserveType.POOL][0],
                _typeToReserves[DexReserveType.POOL][1]
            );

            require(rightAmount <= _typeToReserves[DexReserveType.POOL][1], DexErrors.NOT_ENOUGH_FUNDS);
            require(rightAmount >= _expectedAmount, DexErrors.LOW_EXCHANGE_RATE);
            require(rightAmount > 0, DexErrors.AMOUNT_TOO_LOW);
            require(leftPoolFee > 0 || _fee.pool_numerator == 0, DexErrors.AMOUNT_TOO_LOW);
            require(leftBeneficiaryFee > 0 || _fee.beneficiary_numerator == 0, DexErrors.AMOUNT_TOO_LOW);

            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            _typeToReserves[DexReserveType.POOL][0] += _spentAmount - leftBeneficiaryFee;
            _typeToReserves[DexReserveType.POOL][1] -= rightAmount;

            if (leftBeneficiaryFee > 0) {
                _typeToReserves[DexReserveType.FEE][0] += leftBeneficiaryFee;
                _processBeneficiaryFees(false, _remainingGasTo);
            }

            ExchangeFee[] fees;

            fees.push(
                ExchangeFee(
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    leftPoolFee,
                    leftBeneficiaryFee,
                    _fee.beneficiary
                )
            );

            emit Exchange(
                _accountOwner,
                _accountOwner,
                _typeToRootAddresses[DexAddressType.RESERVE][0],
                _spentAmount,
                _typeToRootAddresses[DexAddressType.RESERVE][1],
                rightAmount,
                fees
            );

            _sync();

            IDexPairOperationCallback(_accountOwner)
                .dexPairExchangeSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 1,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(
                    _callId,
                    true,
                    IExchangeResult.ExchangeResult(
                        true,
                        _spentAmount,
                        leftPoolFee + leftBeneficiaryFee,
                        rightAmount
                    )
                );

            IDexAccount(msg.sender)
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    rightAmount,
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _remainingGasTo
                );

            ISuccessCallback(msg.sender)
                .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (_callId);
        } else if (
            _spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][1] &&
            _receiveTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0]
        ) {
            (
                uint128 leftAmount,
                uint128 rightPoolFee,
                uint128 rightBeneficiaryFee
            ) = _expectedExchange(
                _spentAmount,
                _typeToReserves[DexReserveType.POOL][1],
                _typeToReserves[DexReserveType.POOL][0]
            );

            require(leftAmount <= _typeToReserves[DexReserveType.POOL][0], DexErrors.NOT_ENOUGH_FUNDS);
            require(leftAmount >= _expectedAmount, DexErrors.LOW_EXCHANGE_RATE);
            require(leftAmount > 0, DexErrors.AMOUNT_TOO_LOW);
            require(rightPoolFee > 0 || _fee.pool_numerator == 0, DexErrors.AMOUNT_TOO_LOW);
            require(rightBeneficiaryFee > 0 || _fee.beneficiary_numerator == 0, DexErrors.AMOUNT_TOO_LOW);

            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            _typeToReserves[DexReserveType.POOL][1] += _spentAmount - rightBeneficiaryFee;
            _typeToReserves[DexReserveType.POOL][0] -= leftAmount;

            if (rightBeneficiaryFee > 0) {
                _typeToReserves[DexReserveType.FEE][1] += rightBeneficiaryFee;
                _processBeneficiaryFees(false, _remainingGasTo);
            }

            ExchangeFee[] fees;

            fees.push(
                ExchangeFee(
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    rightPoolFee,
                    rightBeneficiaryFee,
                    _fee.beneficiary
                )
            );

            emit Exchange(
                _accountOwner,
                _accountOwner,
                _typeToRootAddresses[DexAddressType.RESERVE][1],
                _spentAmount,
                _typeToRootAddresses[DexAddressType.RESERVE][0],
                leftAmount,
                fees
            );

            _sync();

            IDexPairOperationCallback(_accountOwner)
                .dexPairExchangeSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 1,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(
                    _callId,
                    true,
                    IExchangeResult.ExchangeResult(
                        false,
                        _spentAmount,
                        rightPoolFee + rightBeneficiaryFee,
                        leftAmount
                    )
                );

            IDexAccount(msg.sender)
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    leftAmount,
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _remainingGasTo
                );

            ISuccessCallback(msg.sender)
                .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (_callId);
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function _expectedExchange(
        uint128 aAmount,
        uint128 aPool,
        uint128 bPool
    ) private view returns (
        uint128,
        uint128,
        uint128
    ) {
        uint128 aFee = math.muldivc(aAmount, _fee.pool_numerator + _fee.beneficiary_numerator, _fee.denominator);
        uint128 aBeneficiaryFee = math.muldiv(aFee, _fee.beneficiary_numerator, _fee.pool_numerator + _fee.beneficiary_numerator);
        uint128 aPoolFee = aFee - aBeneficiaryFee;

        uint128 newAPool = aPool + aAmount;
        uint128 newBPool = math.muldivc(aPool, bPool, newAPool - aFee);
        uint128 expectedBAmount = bPool - newBPool;

        return (expectedBAmount, aPoolFee, aBeneficiaryFee);
    }

    function _expectedSpendAmount(
        uint128 _bAmount,
        uint128 _aPool,
        uint128 _bPool
    ) private view returns (uint128, uint128) {
        uint128 feeDMinusN = uint128(_fee.denominator - _fee.pool_numerator - _fee.beneficiary_numerator);

        uint128 newBPool = _bPool - _bAmount;
        uint128 newAPool = math.muldivc(_aPool, _bPool, newBPool);

        uint128 expectedAAmount = math.muldivc(
            newAPool - _aPool,
            _fee.denominator,
            feeDMinusN
        );

        uint128 aFee = math.muldivc(
            expectedAAmount,
            _fee.pool_numerator + _fee.beneficiary_numerator,
            _fee.denominator
        );

        return (expectedAAmount, aFee);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Cross-pair exchange

    function crossPoolExchange(
        uint64 _id,
        uint32,
        uint8,
        address[] _prevPoolTokenRoots,
        address _spentTokenRoot,
        uint128 _spentAmount,
        address _senderAddress,
        address _remainingGasTo,
        uint128 _deployWalletGrams,
        TvmCell _payload,
        bool _notifySuccess,
        TvmCell _successPayload,
        bool _notifyCancel,
        TvmCell _cancelPayload
    ) override external onlyPair(
        _prevPoolTokenRoots[0],
        _prevPoolTokenRoots[1]
    ) onlyActive {
        require(msg.sender != address(this));

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        TvmSlice payloadSlice = _payload.toSlice();

        uint128 expectedAmount = payloadSlice.decode(uint128);
        address nextTokenRoot =  payloadSlice.bits() >= 267 ? payloadSlice.decode(address) : address(0);

        bool hasNextPayload = payloadSlice.refs() >= 1;

        TvmCell nextPayload;

        if (hasNextPayload) {
            nextPayload = payloadSlice.loadRef();
        }

        bool isLeftToRight = _spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0];
        address fromTokenVault = isLeftToRight ? _typeToWalletAddresses[DexAddressType.VAULT][0] : _typeToWalletAddresses[DexAddressType.VAULT][1];
        address toTokenVault = isLeftToRight ? _typeToWalletAddresses[DexAddressType.VAULT][1] : _typeToWalletAddresses[DexAddressType.VAULT][0];
        address vault = _typeToRootAddresses[DexAddressType.VAULT][0];
        address fromTokenRoot = isLeftToRight ? _typeToRootAddresses[DexReserveType.POOL][0] : _typeToRootAddresses[DexReserveType.POOL][1];
        address toTokenRoot = isLeftToRight ? _typeToRootAddresses[DexReserveType.POOL][1] : _typeToRootAddresses[DexReserveType.POOL][0];
        uint128 fromReserve = isLeftToRight ? _typeToReserves[DexReserveType.POOL][0] : _typeToReserves[DexReserveType.POOL][1];
        uint128 toReserve = isLeftToRight ? _typeToReserves[DexReserveType.POOL][1] : _typeToReserves[DexReserveType.POOL][0];

        if (
            _spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][0] ||
            _spentTokenRoot == _typeToRootAddresses[DexAddressType.RESERVE][1]
        ) {
            (
                uint128 amount,
                uint128 poolFee,
                uint128 beneficiaryFee
            ) = _expectedExchange(
                _spentAmount,
                fromReserve,
                toReserve
            );

            if (
                amount <= toReserve &&
                amount >= expectedAmount &&
                amount > 0 &&
                (poolFee > 0 || _fee.pool_numerator == 0) &&
                (beneficiaryFee > 0 || _fee.beneficiary_numerator == 0)
            ) {
                if (isLeftToRight) {
                    _typeToReserves[DexReserveType.POOL][0] += _spentAmount - beneficiaryFee;
                    _typeToReserves[DexReserveType.POOL][1] -= amount;
                } else {
                    _typeToReserves[DexReserveType.POOL][1] += _spentAmount - beneficiaryFee;
                    _typeToReserves[DexReserveType.POOL][0] -= amount;
                }

                if (beneficiaryFee > 0) {
                    if (isLeftToRight) {
                        _typeToReserves[DexReserveType.FEE][0] += beneficiaryFee;
                    } else {
                        _typeToReserves[DexReserveType.FEE][1] += beneficiaryFee;
                    }

                    _processBeneficiaryFees(false, _remainingGasTo);
                }

                ExchangeFee[] fees;

                fees.push(
                    ExchangeFee(
                        fromTokenRoot,
                        poolFee,
                        beneficiaryFee,
                        _fee.beneficiary
                    )
                );

                emit Exchange(
                    _senderAddress,
                    _senderAddress,
                    fromTokenRoot,
                    _spentAmount,
                    toTokenRoot,
                    amount,
                    fees
                );

                _sync();

                IDexPairOperationCallback(_senderAddress)
                    .dexPairExchangeSuccess{
                        value: DexGas.OPERATION_CALLBACK_BASE + 4,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(
                        _id,
                        false,
                        IExchangeResult.ExchangeResult(
                            true,
                            _spentAmount,
                            poolFee + beneficiaryFee,
                            amount
                        )
                    );

                if (
                    nextTokenRoot.value != 0 &&
                    nextTokenRoot != toTokenRoot &&
                    nextTokenRoot != fromTokenRoot &&
                    hasNextPayload &&
                    nextPayload.toSlice().bits() >= 128 &&
                    msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2
                ) {
                    address nextPair = _expectedPairAddress(toTokenRoot, nextTokenRoot);

                    IDexPair(nextPair)
                        .crossPoolExchange{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                        (
                            _id,
                            _currentVersion,
                            DexPoolTypes.CONSTANT_PRODUCT,
                            _tokenRoots(),
                            toTokenRoot,
                            amount,
                            _senderAddress,
                            _remainingGasTo,
                            _deployWalletGrams,
                            nextPayload,
                            _notifySuccess,
                            _successPayload,
                            _notifyCancel,
                            _cancelPayload
                        );
                } else {
                    IDexVault(vault)
                        .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                        (
                            amount,
                            toTokenRoot,
                            toTokenVault,
                            _senderAddress,
                            _deployWalletGrams,
                            true,
                            _successPayload,
                            fromTokenRoot,
                            toTokenRoot,
                            _currentVersion,
                            _remainingGasTo
                        );
                }
            } else {
                IDexPairOperationCallback(_senderAddress)
                    .dexPairOperationCancelled{
                        value: DexGas.OPERATION_CALLBACK_BASE + 44,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(_id);

                IDexVault(vault)
                    .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                    (
                        _spentAmount,
                        _spentTokenRoot,
                        fromTokenVault,
                        _senderAddress,
                        _deployWalletGrams,
                        true,
                        _cancelPayload,
                        fromTokenRoot,
                        toTokenRoot,
                        _currentVersion,
                        _remainingGasTo
                    );
            }
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }
}
