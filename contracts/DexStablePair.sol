pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "tip3/contracts/interfaces/ITokenRoot.sol";
import "tip3/contracts/interfaces/ITokenWallet.sol";
import "tip3/contracts/interfaces/IBurnableByRootTokenRoot.sol";
import "tip3/contracts/interfaces/IBurnableTokenWallet.sol";
import "tip3/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "./libraries/DexPlatformTypes.sol";
import "./libraries/DexPoolTypes.sol";
import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/PairPayload.sol";
import "./libraries/DexAddressType.sol";
import "./libraries/DexReserveType.sol";
import "./libraries/DirectOperationErrors.sol";

import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexStablePair.sol";
import "./interfaces/IDexBasePool.sol";
import "./interfaces/ISuccessCallback.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IDexTokenVault.sol";
import "./interfaces/IDexPairOperationCallback.sol";

import "./structures/IExchangeResult.sol";
import "./structures/IDepositLiquidityResultV2.sol";
import "./structures/INextExchangeData.sol";
import "./structures/IWithdrawResult.sol";
import "./structures/ITokenOperationStructure.sol";
import "./structures/IPoolTokenData.sol";
import "./structures/IPoolTokenDataPrev.sol";
import "./structures/IFeeParamsPrev.sol";

import "./DexPlatform.sol";
import "./abstract/DexContractBase.sol";

contract DexStablePair is
    DexContractBase,
    IDexStablePair,
    IPoolTokenData,
    IPoolTokenDataPrev,
    INextExchangeData,
    IFeeParamsPrev
{

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Data

    // Base:
    address root;
    address vault;

    // Custom:
    bool active;
    uint32 current_version;

    // Token data
    PoolTokenData[] tokenData;
    mapping(address => uint8) tokenIndex;
    uint256 PRECISION;

    // Liquidity tokens
    address lp_root;
    address lp_wallet;
    uint128 lp_supply;

    // Fee
    FeeParams fee;

    AmplificationCoefficient A;
    uint8 constant N_COINS = 2;

    // ####################################################


    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Base functions

    // Cant be deployed directly
    constructor() public { revert(); }

    function _dexRoot() override internal view returns(address) {
        return root;
    }

    // Prevent manual transfers
    receive() external pure { revert(); }

    // Prevent undefined functions call, need for bounce future Account/Root functions calls, when not upgraded
    fallback() external pure { revert();  }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Getters

    function getRoot() override external view responsible returns (address dex_root) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } root;
    }

    function getTokenRoots() override external view responsible returns (address left, address right, address lp) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (tokenData[0].root, tokenData[1].root, lp_root);
    }

    function getTokenWallets() override external view responsible returns (address left, address right, address lp) {
        return {
            value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS
        } (tokenData[0].wallet, tokenData[1].wallet, lp_wallet);
    }

    function getVersion() override external view responsible returns (uint32 version) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } current_version;
    }

    function getPoolType() override external view responsible returns (uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPoolTypes.STABLESWAP;
    }

    function getAccumulatedFees() override external view responsible returns (uint128[] accumulatedFees) {
        uint128[] _accumulatedFees = new uint128[](0);

        for (uint8 i = 0; i < N_COINS; i++) {
            _accumulatedFees.push(tokenData[i].accumulatedFee);
        }

        return {
            value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS
        } _accumulatedFees;
    }

    function getFeeParams() override external view responsible returns (FeeParams) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } fee;
    }

    function getAmplificationCoefficient() override external view responsible returns (AmplificationCoefficient) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } A;
    }

    function isActive() override external view responsible returns (bool) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } active;
    }

    function getBalances() override external view responsible returns (DexPairBalances) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPairBalances(
            lp_supply,
            tokenData[0].balance,
            tokenData[1].balance
        );
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Setters

    function setAmplificationCoefficient(AmplificationCoefficient _A, address send_gas_to) override external onlyRoot {
        require(msg.value >= DexGas.SET_FEE_PARAMS_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        A = _A;

        emit AmplificationCoefficientUpdated(A);

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false });

    }

    function setFeeParams(FeeParams params, address send_gas_to) override external onlyRoot {
        require(params.denominator != 0 &&
                (params.pool_numerator + params.beneficiary_numerator) < params.denominator &&
                ((params.beneficiary.value != 0 && params.beneficiary_numerator != 0) ||
                 (params.beneficiary.value == 0 && params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS);
        require(msg.value >= DexGas.SET_FEE_PARAMS_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        if (fee.beneficiary.value != 0) {
            _processBeneficiaryFees(true, send_gas_to);
        }

        fee = params;
        emit FeesParamsUpdated(fee);

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false });

    }

    function withdrawBeneficiaryFee(address send_gas_to) external {
        require(fee.beneficiary.value != 0 && msg.sender == fee.beneficiary, DexErrors.NOT_BENEFICIARY);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        _processBeneficiaryFees(true, send_gas_to);
        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
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

    function buildExchangePayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) external pure returns (TvmCell) {
        return PairPayload.buildExchangePayloadV2(
            _id,
            _deployWalletGrams,
            _expectedAmount,
            _recipient,
            address(0),
            _referrer,
            _successPayload,
            _cancelPayload
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

    function buildDepositLiquidityPayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) external pure returns (TvmCell) {
        return PairPayload.buildDepositLiquidityPayloadV2(
            _id,
            _deployWalletGrams,
            _expectedAmount,
            _recipient,
            _referrer,
            _successPayload,
            _cancelPayload
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

    function buildWithdrawLiquidityPayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedLeftAmount,
        uint128 _expectedRightAmount,
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) external pure returns (TvmCell) {
        return PairPayload.buildWithdrawLiquidityPayloadV2(
            _id,
            _deployWalletGrams,
            [_expectedLeftAmount, _expectedRightAmount],
            _recipient,
            _referrer,
            _successPayload,
            _cancelPayload
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

    function buildCrossPairExchangePayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _outcoming,
        uint32[] _nextStepIndices,
        ExchangeStep[] _steps,
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) external view returns (TvmCell) {
        address[] pools;

        // Calculate pools' addresses by token roots
        for (uint32 i = 0; i < _steps.length; i++) {
            pools.push(_expectedPoolAddress(_steps[i].roots));
        }

        return PairPayload.buildCrossPairExchangePayloadV2(
            _id,
            _deployWalletGrams,
            _recipient,
            _expectedAmount,
            _outcoming,
            _nextStepIndices,
            _steps,
            pools,
            _referrer,
            _successPayload,
            _cancelPayload
        );
    }

    function onAcceptTokensTransfer(
        address token_root,
        uint128 tokens_amount,
        address sender_address,
        address sender_wallet,
        address original_gas_to,
        TvmCell payload
    ) override external {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Decode base data from payload
        (
            bool is_payload_valid,
            uint8 op,
            uint64 id,
            uint128 deploy_wallet_grams,
            address recipient,
            uint128[] expected_amounts,
            /*address outcoming*/,
            NextExchangeData[] next_steps,
            address referrer
        ) = PairPayload.decodeOnAcceptTokensTransferData(payload);

        uint128 expected_amount = expected_amounts.length == 1 ? expected_amounts[0] : 0;
        if (expected_amounts.length == 0) {
            expected_amounts = new uint128[](N_COINS);
        }

        // Set sender as recipient if it's empty
        recipient = recipient.value == 0 ? sender_address : recipient;

        // Decode payloads for callbacks
        (
            bool notify_success,
            TvmCell success_payload,
            bool notify_cancel,
            TvmCell cancel_payload
        ) = PairPayload.decodeOnAcceptTokensTransferPayloads(payload, op);

        TvmCell empty;
        uint128 referrer_value = referrer.value != 0 ? DexGas.TRANSFER_REFERRER_FEE_BASE + DexGas.DEPLOY_REFERRER_FEE_EMPTY_WALLET + DexGas.REFERRAL_PROGRAM_CALLBACK + 0.1 ton : 0;

        uint16 errorCode = _checkOperationData(msg.sender, msg.value, is_payload_valid, deploy_wallet_grams, op, token_root, referrer_value);

        if (errorCode == 0) {
            if (msg.sender == lp_wallet) {
                if (op == DexOperationTypes.WITHDRAW_LIQUIDITY || op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) {

                    optional(TokenOperation[]) operationsOpt = _withdrawLiquidityBase(tokens_amount, expected_amounts, sender_address, recipient);

                    if (!operationsOpt.hasValue()) {
                        errorCode = DirectOperationErrors.RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED;
                    } else {
                        TokenOperation[] operations = operationsOpt.get();

                        IDexPairOperationCallback(sender_address).dexPairWithdrawSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 30,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IWithdrawResult.WithdrawResult(tokens_amount, operations[0].amount, operations[1].amount));

                        if (recipient != sender_address) {
                            IDexPairOperationCallback(recipient).dexPairWithdrawSuccess{
                                value: DexGas.OPERATION_CALLBACK_BASE,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(id, false, IWithdrawResult.WithdrawResult(tokens_amount, operations[0].amount, operations[1].amount));
                        }

                        for (uint8 ii = 0; ii < N_COINS; ii++) {
                            if (operations[ii].amount >= 0) {
                                IDexTokenVault(_expectedTokenVaultAddress(operations[ii].root)).transfer{
                                    value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deploy_wallet_grams,
                                    flag: MsgFlag.SENDER_PAYS_FEES
                                }(
                                    operations[ii].amount,
                                    recipient,
                                    deploy_wallet_grams,
                                    notify_success,
                                    PairPayload.buildSuccessPayload(op, success_payload, sender_address),
                                    _tokenRoots(),
                                    current_version,
                                    original_gas_to
                                );
                            }
                        }

                        IBurnableTokenWallet(msg.sender).burn{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                            tokens_amount,
                            original_gas_to,
                            address.makeAddrStd(0, 0),
                            empty
                        );
                    }
                } else {
                    errorCode = DirectOperationErrors.WRONG_OPERATION_TYPE;
                }
            } else {
                uint8 i = tokenIndex[token_root];
                uint8 j = i == 0 ? 1 : 0;

                if (op == DexOperationTypes.EXCHANGE || op == DexOperationTypes.EXCHANGE_V2) {
                    (optional(ExpectedExchangeResult) dy_result_opt, uint128 referrer_fee) = _get_dy(i, j, tokens_amount, referrer);

                    if (!dy_result_opt.hasValue()){
                        errorCode = DirectOperationErrors.INVALID_RECEIVED_AMOUNT;
                    } else if (dy_result_opt.get().amount < expected_amount) {
                        errorCode = DirectOperationErrors.RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED;
                    } else {
                        ExpectedExchangeResult dy_result = dy_result_opt.get();

                        tokenData[i].balance += tokens_amount - dy_result.beneficiary_fee - referrer_fee;
                        tokenData[j].balance -= dy_result.amount;

                        ExchangeFee[] fees = new ExchangeFee[](0);
                        fees.push(ExchangeFee(
                                tokenData[i].root,
                                dy_result.pool_fee,
                                dy_result.beneficiary_fee,
                                fee.beneficiary
                            ));

                        emit Exchange(
                            sender_address,
                            recipient,
                            tokenData[i].root,
                            tokens_amount,
                            tokenData[j].root,
                            dy_result.amount,
                            fees
                        );

                        if (dy_result.beneficiary_fee > 0) {
                            tokenData[i].accumulatedFee += dy_result.beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        if (referrer_fee > 0) {
                            IDexTokenVault(_expectedTokenVaultAddress(tokenData[i].root)).referralFeeTransfer{
                                value: referrer_value,
                                flag: MsgFlag.SENDER_PAYS_FEES
                            }(
                                referrer_fee,
                                referrer,
                                original_gas_to,
                                _tokenRoots()
                            );

                            emit ReferrerFees([TokenOperation(referrer_fee, tokenData[i].root)]);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 10,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(
                            i == 0 && j == 1,
                            tokens_amount,
                            dy_result.pool_fee + dy_result.beneficiary_fee + referrer_fee,
                            dy_result.amount
                        ));

                        if (recipient != sender_address) {
                            IDexPairOperationCallback(recipient).dexPairExchangeSuccess{
                                value: DexGas.OPERATION_CALLBACK_BASE,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(id, false, IExchangeResult.ExchangeResult(
                                i == 0 && j == 1,
                                tokens_amount,
                                dy_result.pool_fee + dy_result.beneficiary_fee + referrer_fee,
                                dy_result.amount
                            ));
                        }

                        ITokenWallet(msg.sender).transfer{
                            value: DexGas.TRANSFER_TOKENS_VALUE,
                            flag: MsgFlag.SENDER_PAYS_FEES
                        }(
                            tokens_amount,
                            _expectedTokenVaultAddress(token_root),
                            0,
                            original_gas_to,
                            false,
                            empty
                        );

                        IDexTokenVault(_expectedTokenVaultAddress(tokenData[j].root)).transfer{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            dy_result.amount,
                            recipient,
                            deploy_wallet_grams,
                            notify_success,
                            PairPayload.buildSuccessPayload(op, success_payload, sender_address),
                            _tokenRoots(),
                            current_version,
                            original_gas_to
                        );
                    }
                } else if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE || op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {

                    if (next_steps.length == 0) errorCode = DirectOperationErrors.INVALID_NEXT_STEPS;

                    if (errorCode == 0 && op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {
                        // actually poolRoot is a tokenRoot here, so
                        next_steps[0].poolRoot = _expectedPoolAddress([tokenData[j].root, next_steps[0].poolRoot]);
                    }

                    (optional(ExpectedExchangeResult) dy_result_opt, uint128 referrer_fee) = _get_dy(i, j, tokens_amount, referrer);

                    uint256 denominator = 0;
                    uint32 all_nested_nodes = uint32(next_steps.length);
                    uint32 all_leaves = 0;
                    uint32 max_nested_nodes = 0;
                    uint32 max_nested_nodes_idx = 0;
                    for (uint32 idx = 0; idx < next_steps.length; idx++) {
                        NextExchangeData next_step = next_steps[idx];
                        if (next_step.poolRoot.value == 0 || next_step.poolRoot == address(this) ||
                            next_step.numerator == 0 || next_step.leaves == 0) {

                            errorCode = DirectOperationErrors.INVALID_NEXT_STEPS;
                            break;
                        }
                        if (next_step.nestedNodes > max_nested_nodes) {
                            max_nested_nodes = next_step.nestedNodes;
                            max_nested_nodes_idx = idx;
                        }
                        denominator += next_step.numerator;
                        all_nested_nodes += next_step.nestedNodes;
                        all_leaves += next_step.leaves;
                    }

                    if (errorCode == 0) {
                        if (msg.value < (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) * (1 + all_nested_nodes)) {
                            errorCode = DirectOperationErrors.VALUE_TOO_LOW;
                        } else if (!dy_result_opt.hasValue()) {
                            errorCode = DirectOperationErrors.INVALID_RECEIVED_AMOUNT;
                        } else if (dy_result_opt.get().amount < expected_amount) {
                            errorCode = DirectOperationErrors.RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED;
                        }
                    }

                    if (errorCode == 0) {
                        ExpectedExchangeResult dy_result = dy_result_opt.get();

                        tokenData[i].balance += tokens_amount - dy_result.beneficiary_fee - referrer_fee;
                        tokenData[j].balance -= dy_result.amount;

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(tokenData[i].root, dy_result.pool_fee, dy_result.beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            recipient,
                            tokenData[i].root,
                            tokens_amount,
                            tokenData[j].root,
                            dy_result.amount,
                            fees
                        );

                        if (dy_result.beneficiary_fee > 0) {
                            tokenData[i].accumulatedFee += dy_result.beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        if (referrer_fee > 0) {
                            IDexTokenVault(_expectedTokenVaultAddress(tokenData[i].root)).referralFeeTransfer{
                                value: referrer_value,
                                flag: MsgFlag.SENDER_PAYS_FEES
                            }(
                                referrer_fee,
                                referrer,
                                original_gas_to,
                                _tokenRoots()
                            );

                            emit ReferrerFees([TokenOperation(referrer_fee, tokenData[i].root)]);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 40,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(
                            i == 0 && j == 1,
                            tokens_amount,
                            dy_result.pool_fee + dy_result.beneficiary_fee + referrer_fee,
                            dy_result.amount
                        ));

                        ITokenWallet(msg.sender).transfer{
                            value: DexGas.TRANSFER_TOKENS_VALUE,
                            flag: MsgFlag.SENDER_PAYS_FEES
                        }(
                            tokens_amount,
                            _expectedTokenVaultAddress(token_root),
                            0,
                            original_gas_to,
                            false,
                            empty
                        );

                        uint128 extraValue = msg.value - (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) * (1 + all_nested_nodes);

                        for (uint32 idx = 0; idx < next_steps.length; idx++) {
                            NextExchangeData next_step = next_steps[idx];

                            uint128 next_pool_amount = uint128(math.muldiv(dy_result.amount, next_step.numerator, denominator));
                            uint128 current_extra_value = math.muldiv(uint128(next_step.leaves), extraValue, uint128(all_leaves));

                            IDexBasePool(next_step.poolRoot).crossPoolExchange{
                                value: idx == max_nested_nodes_idx ? 0 : (next_step.nestedNodes + 1) * (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) + current_extra_value,
                                flag: idx == max_nested_nodes_idx ? MsgFlag.ALL_NOT_RESERVED : MsgFlag.SENDER_PAYS_FEES
                            }(
                                id,

                                current_version,
                                DexPoolTypes.STABLESWAP,

                                _tokenRoots(),

                                op,
                                tokenData[j].root,
                                next_pool_amount,

                                sender_address,
                                recipient,
                                referrer,

                                original_gas_to,
                                deploy_wallet_grams,

                                next_step.payload,
                                notify_success,
                                success_payload,
                                notify_cancel,
                                cancel_payload
                            );
                        }
                    }
                } else if (op == DexOperationTypes.DEPOSIT_LIQUIDITY || op == DexOperationTypes.DEPOSIT_LIQUIDITY_V2) {

                    uint128[] amounts = new uint128[](N_COINS);
                    amounts[i] = tokens_amount;
                    amounts[j] = 0;
                    (optional(DepositLiquidityResultV2) resultOpt, uint128[] referrer_fees) = _expectedDepositLiquidity(amounts, referrer);

                    if (!resultOpt.hasValue()) {
                        errorCode = DirectOperationErrors.INVALID_RECEIVED_AMOUNT;
                    } else if (resultOpt.get().lp_reward < expected_amount) {
                        errorCode = DirectOperationErrors.RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED;
                    } else {
                        DepositLiquidityResultV2 result = resultOpt.get();
                        _applyAddLiquidity(result, referrer_fees, id, false, sender_address, recipient, referrer, referrer_value, original_gas_to);

                        ITokenWallet(msg.sender).transfer{
                            value: DexGas.TRANSFER_TOKENS_VALUE,
                            flag: MsgFlag.SENDER_PAYS_FEES
                        }(
                            tokens_amount,
                            _expectedTokenVaultAddress(token_root),
                            0,
                            original_gas_to,
                            false,
                            empty
                        );

                        ITokenRoot(lp_root).mint{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            result.lp_reward,
                            recipient,
                            deploy_wallet_grams,
                            original_gas_to,
                            notify_success,
                            PairPayload.buildSuccessPayload(op, success_payload, sender_address)
                        );
                    }
                } else {
                    errorCode = DirectOperationErrors.WRONG_OPERATION_TYPE;
                }
            }
        }

        if (errorCode != 0) {
            IDexPairOperationCallback(sender_address).dexPairOperationCancelled{
                value: DexGas.OPERATION_CALLBACK_BASE + 44,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(id);

            ITokenWallet(msg.sender).transferToWallet{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                tokens_amount,
                sender_wallet,
                original_gas_to,
                notify_cancel,
                PairPayload.buildCancelPayload(op, errorCode, success_payload, next_steps)
            );
        } else {
            _sync();
        }
    }

    function _checkOperationData(
        address msg_sender,
        uint128 msg_value,
        bool is_payload_valid,
        uint128 deploy_wallet_grams,
        uint8 op,
        address token_root,
        uint128 referrer_value
    ) private view returns (uint16) {

        if (!active) return DirectOperationErrors.NOT_ACTIVE;
        if (!is_payload_valid) return DirectOperationErrors.INVALID_PAYLOAD;
        if (lp_supply == 0) return DirectOperationErrors.NON_POSITIVE_LP_SUPPLY;
        if (msg_value < DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deploy_wallet_grams + referrer_value) return DirectOperationErrors.VALUE_TOO_LOW;

        if (token_root == lp_root && msg_sender != lp_wallet) return DirectOperationErrors.NOT_LP_TOKEN_WALLET;
        if (token_root != lp_root) {
            if (!tokenIndex.exists(token_root)) return DirectOperationErrors.NOT_TOKEN_ROOT;
            if (msg_sender.value == 0 || msg_sender != tokenData[tokenIndex.at(token_root)].wallet) return DirectOperationErrors.NOT_TOKEN_WALLET;
        }

        if (!(msg_sender == lp_wallet && (op == DexOperationTypes.WITHDRAW_LIQUIDITY || op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) ||
            msg_sender != lp_wallet && (
                op == DexOperationTypes.DEPOSIT_LIQUIDITY || op == DexOperationTypes.DEPOSIT_LIQUIDITY_V2 ||
                op == DexOperationTypes.EXCHANGE || op == DexOperationTypes.EXCHANGE_V2 ||
                op == DexOperationTypes.CROSS_PAIR_EXCHANGE || op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2
            )
        )) return DirectOperationErrors.WRONG_OPERATION_TYPE;

        if ((op == DexOperationTypes.WITHDRAW_LIQUIDITY || op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) && msg_value < DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + N_COINS * deploy_wallet_grams + referrer_value) {
            return DirectOperationErrors.VALUE_TOO_LOW;
        }

        return 0;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deposit liquidity

    function expectedDepositLiquidityV2(
        uint128[] amounts
    ) override external view responsible returns (DepositLiquidityResultV2) {
        (optional(DepositLiquidityResultV2) resultOpt,) = _expectedDepositLiquidity(amounts, address(0));
        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } resultOpt.get();
    }

    function depositLiquidity(
        uint64 call_id,
        TokenOperation[] _operations,
        TokenOperation _expected,
        bool    auto_change,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to,
        address referrer
    ) override external onlyActive onlyAccount(account_owner) {
        require(_expected.root == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        require(lp_supply != 0 || (_operations[0].amount > 0 && _operations[1].amount > 0), DexErrors.WRONG_LIQUIDITY);
        require(
            (_operations[0].amount > 0 && _operations[1].amount > 0) ||
            (auto_change && (_operations[0].amount + _operations[1].amount > 0)),
            DexErrors.AMOUNT_TOO_LOW
        );

        uint128[] amounts = new uint128[](0);
        amounts.push(_operations[0].amount);
        amounts.push(_operations[1].amount);
        (optional(DepositLiquidityResultV2) resultOpt, uint128[] referrer_fees) = _expectedDepositLiquidity(amounts, referrer);
        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);
        DepositLiquidityResultV2 result = resultOpt.get();
        require(result.lp_reward >= _expected.amount, DexErrors.WRONG_LIQUIDITY);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        uint128 referrer_value = referrer.value != 0 ? DexGas.TRANSFER_REFERRER_FEE_BASE + DexGas.DEPLOY_REFERRER_FEE_EMPTY_WALLET + DexGas.REFERRAL_PROGRAM_CALLBACK + 0.1 ton : 0;

        _applyAddLiquidity(result, referrer_fees, call_id, true, account_owner, account_owner, referrer, referrer_value, send_gas_to);

        _sync();

        TvmCell empty;
        ITokenRoot(lp_root)
            .mint{
                value: DexGas.DEPLOY_MINT_VALUE_BASE + DexGas.DEPLOY_EMPTY_WALLET_GRAMS,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                result.lp_reward,
                account_owner,
                DexGas.DEPLOY_EMPTY_WALLET_GRAMS,
                send_gas_to,
                send_gas_to == account_owner,
                empty
            );

        ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Withdraw liquidity

    function _withdrawLiquidityBase(uint128 lp_amount, uint128[] expected_amounts, address sender_address, address recipient) private returns (optional(TokenOperation[])) {
        optional(TokenOperation[]) operations;

        TokenOperation[] ops = new TokenOperation[](0);
        for (uint8 i = 0; i < N_COINS; i++) {
            uint128 amount = math.muldiv(tokenData[i].balance, lp_amount, lp_supply);
            if (amount < expected_amounts[i]) {
                return operations;
            }
            tokenData[i].balance -= amount;
            ops.push(TokenOperation(amount, tokenData[i].root));
        }

        operations.set(ops);
        lp_supply -= lp_amount;

        emit WithdrawLiquidity(sender_address, recipient, lp_amount, ops);

        return operations;
    }

    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) override external view responsible returns (uint128 expected_left_amount, uint128 expected_right_amount) {
        uint128 left_back_amount =  math.muldiv(tokenData[0].balance, lp_amount, lp_supply);
        uint128 right_back_amount = math.muldiv(tokenData[1].balance, lp_amount, lp_supply);

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_back_amount, right_back_amount);
    }

    function withdrawLiquidity(
        uint64 call_id,
        TokenOperation _operation,
        TokenOperation[] _expected,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        require(_operation.root == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        uint128[] expected_amounts = new uint128[](N_COINS);
        for (TokenOperation amt: _expected) {
            expected_amounts[tokenIndex[amt.root]] = amt.amount;
        }

        optional(TokenOperation[]) operationsOpt = _withdrawLiquidityBase(_operation.amount, expected_amounts, account_owner, account_owner);
        require(operationsOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);

        TokenOperation[] operations = operationsOpt.get();
        _sync();

        IDexPairOperationCallback(account_owner)
            .dexPairWithdrawSuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 3,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(
                call_id,
                true,
                IWithdrawResult.WithdrawResult(
                    _operation.amount,
                    operations[0].amount,
                    operations[1].amount
                )
            );

        for (TokenOperation op: operations) {
            if (op.amount >= 0) {
                IDexAccount(msg.sender)
                    .internalPoolTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                    (
                        op.amount,
                        op.root,
                        [tokenData[0].root, tokenData[1].root],
                        send_gas_to
                    );
            }
        }

        TvmCell empty;
        IBurnableByRootTokenRoot(lp_root).burnTokens{
            value: DexGas.BURN_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(
            _operation.amount,
            _expectedTokenVaultAddress(lp_root),
            send_gas_to,
            address(0),
            empty
        );

        ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Exchange

    function expectedExchange(
        uint128 amount,
        address spent_token_root
    ) override external view responsible returns (uint128 expected_amount, uint128 expected_fee) {
        require(tokenIndex.exists(spent_token_root), DexErrors.NOT_TOKEN_ROOT);
        uint8 i = tokenIndex[spent_token_root];
        uint8 j = i == 0 ? 1 : 0;
        (optional(ExpectedExchangeResult) dy_result_opt,) = _get_dy(i, j, amount, address(0));
        if (dy_result_opt.hasValue()) {
            ExpectedExchangeResult dy_result = dy_result_opt.get();

            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (dy_result.amount, dy_result.pool_fee + dy_result.beneficiary_fee);
        } else {
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (0, 0);
        }
    }

    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root
    ) override external view responsible returns (uint128 expected_amount, uint128 expected_fee) {
        require(tokenIndex.exists(receive_token_root), DexErrors.NOT_TOKEN_ROOT);
        uint8 j = tokenIndex[receive_token_root];
        uint8 i = j == 0 ? 1 : 0;
        optional(ExpectedExchangeResult) dx_result_opt = _get_dx(i, j, receive_amount);
        require(dx_result_opt.hasValue(), DexErrors.WRONG_AMOUNT);

        ExpectedExchangeResult dx_result = dx_result_opt.get();

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (dx_result.amount, dx_result.pool_fee + dx_result.beneficiary_fee);
    }

    function exchange(
        uint64 call_id,
        TokenOperation _operation,
        TokenOperation _expected,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        require(tokenIndex.exists(_operation.root) && tokenIndex.exists(_expected.root), DexErrors.NOT_TOKEN_ROOT);
        uint8 i = tokenIndex[_operation.root];
        uint8 j = tokenIndex[_expected.root];
        require(i != j && i < N_COINS && j < N_COINS, DexErrors.WRONG_TOKEN_ROOT);
        (optional(ExpectedExchangeResult) dy_result_opt,) = _get_dy(i, j, _operation.amount, address(0));
        require(dy_result_opt.hasValue(), DexErrors.WRONG_AMOUNT);

        ExpectedExchangeResult dy_result = dy_result_opt.get();

        require(dy_result.amount >= _expected.amount, DexErrors.LOW_EXCHANGE_RATE);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        tokenData[i].balance += _operation.amount - dy_result.beneficiary_fee;
        tokenData[j].balance -= dy_result.amount;

        if (dy_result.beneficiary_fee > 0) {
            tokenData[i].accumulatedFee += dy_result.beneficiary_fee;
            _processBeneficiaryFees(false, send_gas_to);
        }

        ExchangeFee[] fees;
        fees.push(ExchangeFee(tokenData[i].root, dy_result.pool_fee, dy_result.beneficiary_fee, fee.beneficiary));

        emit Exchange(
            account_owner,
            account_owner,
            tokenData[i].root,
            _operation.amount,
            tokenData[j].root,
            dy_result.amount,
            fees
        );

        _sync();

        IDexPairOperationCallback(account_owner).dexPairExchangeSuccess{
            value: DexGas.OPERATION_CALLBACK_BASE + 1,
            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
            bounce: false
        }(call_id, true, IExchangeResult.ExchangeResult(
            i == 0 && j == 1,
            _operation.amount,
            dy_result.pool_fee + dy_result.beneficiary_fee,
            dy_result.amount
        ));

        IDexAccount(msg.sender)
            .internalPoolTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
            (
                dy_result.amount,
                _expected.root,
                [tokenData[0].root, tokenData[1].root],
                send_gas_to
            );

        ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Fee

    function _processBeneficiaryFees(bool force, address send_gas_to) private {
        address beneficiaryAccount = _expectedAccountAddress(fee.beneficiary);

        for (uint8 i = 0; i < N_COINS; i++) {
            address _root = tokenData[i].root;
            if (
                (tokenData[i].accumulatedFee > 0 && force) ||
                !fee.threshold.exists(_root) ||
                tokenData[i].accumulatedFee >= fee.threshold[_root]
            ) {
                IDexAccount(beneficiaryAccount)
                    .internalPoolTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                    (
                        tokenData[i].accumulatedFee,
                        tokenData[i].root,
                        [tokenData[0].root, tokenData[1].root],
                        send_gas_to
                    );

                tokenData[i].accumulatedFee = 0;
            }
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Cross-pair exchange

    function crossPoolExchange(
        uint64 id,

        uint32 /*prev_pool_version*/,
        uint8 /*prev_pool_type*/,

        address[] prev_pool_token_roots,

        uint8 op,
        address spent_token_root,
        uint128 spent_amount,

        address sender_address,
        address recipient,
        address referrer,

        address original_gas_to,
        uint128 deploy_wallet_grams,

        TvmCell payload,
        bool notify_success,
        TvmCell success_payload,
        bool notify_cancel,
        TvmCell cancel_payload
    ) override external onlyPoolOrTokenVault(prev_pool_token_roots, spent_token_root) {
        require(tokenIndex.exists(spent_token_root), DexErrors.NOT_TOKEN_ROOT);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        (
            uint128 expected_amount,
            /*address outcoming*/,
            NextExchangeData[] next_steps
        ) = PairPayload.decodeCrossPoolExchangePayload(payload, op);

        uint16 errorCode = !active ? DirectOperationErrors.NOT_ACTIVE
            : msg.sender == address(this) ? DirectOperationErrors.WRONG_PREVIOUS_POOL
            : 0;

        uint8 i = tokenIndex.at(spent_token_root);
        uint8 j = i == 0 ? 1 : 0;

        optional(ExpectedExchangeResult) dy_result_opt;
        uint128 referrer_fee = 0;

        if (errorCode == 0) {
            (dy_result_opt, referrer_fee) = _get_dy(i, j, spent_amount, referrer);
            errorCode = dy_result_opt.hasValue() ? 0 : DirectOperationErrors.INVALID_RECEIVED_AMOUNT;
        }

        if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE && next_steps.length > 0) {
            // actually poolRoot is a tokenRoot here, so
            next_steps[0].poolRoot = _expectedPoolAddress([_tokenRoots()[j], next_steps[0].poolRoot]);
        }

        uint128 referrer_value = referrer.value != 0 ? DexGas.TRANSFER_REFERRER_FEE_BASE + DexGas.DEPLOY_REFERRER_FEE_EMPTY_WALLET + DexGas.REFERRAL_PROGRAM_CALLBACK + 0.1 ton : 0;

        if (errorCode == 0) {
            ExpectedExchangeResult dy_result = dy_result_opt.get();

            if (dy_result.amount < expected_amount) {
                errorCode = DirectOperationErrors.RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED;
            } {
                tokenData[i].balance += spent_amount - dy_result.beneficiary_fee - referrer_fee;
                tokenData[j].balance -= dy_result.amount;

                ExchangeFee[] fees;
                fees.push(ExchangeFee(tokenData[i].root, dy_result.pool_fee, dy_result.beneficiary_fee, fee.beneficiary));

                emit Exchange(
                    sender_address,
                    recipient,
                    tokenData[i].root,
                    spent_amount,
                    tokenData[j].root,
                    dy_result.amount,
                    fees
                );

               _sync();

                if (dy_result.beneficiary_fee > 0) {
                    tokenData[i].accumulatedFee += dy_result.beneficiary_fee;
                    _processBeneficiaryFees(false, original_gas_to);
                }

                if (referrer_fee > 0) {
                    IDexTokenVault(_expectedTokenVaultAddress(tokenData[i].root)).referralFeeTransfer{
                        value: referrer_value,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        referrer_fee,
                        referrer,
                        original_gas_to,
                        _tokenRoots()
                    );

                    emit ReferrerFees([TokenOperation(referrer_fee, tokenData[i].root)]);
                }

                IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 4,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id, false, IExchangeResult.ExchangeResult(
                    true,
                    spent_amount,
                    dy_result.pool_fee + dy_result.beneficiary_fee + referrer_fee,
                    dy_result.amount
                ));

                if (recipient != sender_address) {
                    IDexPairOperationCallback(recipient).dexPairExchangeSuccess{
                        value: DexGas.OPERATION_CALLBACK_BASE,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(id, false, IExchangeResult.ExchangeResult(
                        true,
                        spent_amount,
                        dy_result.pool_fee + dy_result.beneficiary_fee + referrer_fee,
                        dy_result.amount
                    ));
                }

                uint16 post_swap_error_code = 0;

                uint256 denominator = 0;
                uint32 all_nested_nodes = uint32(next_steps.length);
                uint32 all_leaves = 0;
                uint32 max_nested_nodes = 0;
                uint32 max_nested_nodes_idx = 0;
                for (uint32 idx = 0; idx < next_steps.length; idx++) {
                    NextExchangeData next_step = next_steps[idx];
                    if (next_step.poolRoot.value == 0 || next_step.poolRoot == address(this) ||
                        next_step.numerator == 0 || next_step.leaves == 0) {

                        post_swap_error_code = DirectOperationErrors.INVALID_NEXT_STEPS;
                        break;
                    }
                    if (next_step.nestedNodes > max_nested_nodes) {
                        max_nested_nodes = next_step.nestedNodes;
                        max_nested_nodes_idx = idx;
                    }
                    denominator += next_step.numerator;
                    all_nested_nodes += next_step.nestedNodes;
                    all_leaves += next_step.leaves;
                }

                if (post_swap_error_code == 0 && msg.value < (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) * (1 + all_nested_nodes)) {
                    post_swap_error_code = DirectOperationErrors.VALUE_TOO_LOW;
                }

                if (post_swap_error_code == 0 && next_steps.length > 0) {
                    uint128 extraValue = msg.value - (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) * (1 + all_nested_nodes);

                    for (uint32 idx = 0; idx < next_steps.length; idx++) {
                        NextExchangeData next_step = next_steps[idx];

                        uint128 next_pool_amount = uint128(math.muldiv(dy_result.amount, next_step.numerator, denominator));
                        uint128 current_extra_value = math.muldiv(uint128(next_step.leaves), extraValue, uint128(all_leaves));

                        IDexBasePool(next_step.poolRoot).crossPoolExchange{
                            value: idx == max_nested_nodes_idx ? 0 : (next_step.nestedNodes + 1) * (DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + referrer_value) + current_extra_value,
                            flag: idx == max_nested_nodes_idx ? MsgFlag.ALL_NOT_RESERVED : MsgFlag.SENDER_PAYS_FEES
                        }(
                            id,

                            current_version,
                            DexPoolTypes.STABLESWAP,

                            _tokenRoots(),

                            op,
                            tokenData[j].root,
                            next_pool_amount,

                            sender_address,
                            recipient,
                            referrer,

                            original_gas_to,
                            deploy_wallet_grams,

                            next_step.payload,
                            notify_success,
                            success_payload,
                            notify_cancel,
                            cancel_payload
                        );
                    }
                } else {
                    bool is_last_step = next_steps.length == 0;

                    if (!is_last_step) {
                        IDexPairOperationCallback(sender_address).dexPairOperationCancelled{
                            value: DexGas.OPERATION_CALLBACK_BASE + 44,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id);

                        if (recipient != sender_address) {
                            IDexPairOperationCallback(recipient).dexPairOperationCancelled{
                                value: DexGas.OPERATION_CALLBACK_BASE,
                                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                                bounce: false
                            }(id);
                        }
                    }

                    IDexTokenVault(_expectedTokenVaultAddress(tokenData[j].root)).transfer{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        dy_result.amount,
                        is_last_step ? recipient : sender_address,
                        deploy_wallet_grams,
                        is_last_step ? notify_success : notify_cancel,
                        is_last_step
                            ? PairPayload.buildSuccessPayload(op, success_payload, sender_address)
                            : PairPayload.buildCancelPayload(op, post_swap_error_code, cancel_payload, next_steps),
                        _tokenRoots(),
                        current_version,
                        original_gas_to
                    );
                }
           }
        }

        if (errorCode != 0) {
            IDexPairOperationCallback(sender_address).dexPairOperationCancelled{
                value: DexGas.OPERATION_CALLBACK_BASE + 44,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(id);

            if (recipient != sender_address) {
                IDexPairOperationCallback(recipient).dexPairOperationCancelled{
                    value: DexGas.OPERATION_CALLBACK_BASE,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id);
            }

            IDexTokenVault(_expectedTokenVaultAddress(spent_token_root)).transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED
            }(
                spent_amount,
                sender_address,
                deploy_wallet_grams,
                notify_cancel,
                PairPayload.buildCancelPayload(op, errorCode, cancel_payload, next_steps),
                _tokenRoots(),
                current_version,
                original_gas_to
            );
        }

    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Account operations

    function checkPair(address account_owner, uint32 /*account_version*/)
        override
        external
        onlyAccount(account_owner)
    {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        IDexAccount(msg.sender)
            .checkPoolCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                [tokenData[0].root, tokenData[1].root],
                lp_root
            );
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Modifiers

    modifier onlyActive() {
        require(active, DexErrors.NOT_ACTIVE);
        _;
    }

    modifier onlyLiquidityTokenRoot() {
        require(msg.sender == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        _;
    }

    modifier onlyTokenRoot() {
        bool found = false;
        for (uint8 i = 0; i < N_COINS; i++) {
            if (tokenData[i].root == msg.sender) {
                found = true;
                break;
            }
        }
        require(found, DexErrors.NOT_TOKEN_ROOT);
        _;
    }

    modifier onlyRoot() {
        require(msg.sender == root, DexErrors.NOT_ROOT);
        _;
    }

    modifier onlyPoolOrTokenVault(address[] _poolTokenRoots, address _tokenRoot) {
        require(
            msg.sender == _expectedPoolAddress(_poolTokenRoots) ||
            msg.sender == _expectedTokenVaultAddress(_tokenRoot),
            DexErrors.NEITHER_POOL_NOR_VAULT
        );
        _;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Code upgrade

    function upgrade(TvmCell code, uint32 new_version, uint8 new_type, address send_gas_to) override external onlyRoot {
        if (current_version == new_version && new_type == DexPoolTypes.STABLESWAP) {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
            send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
        } else {
            if (fee.beneficiary.value != 0) {
                _processBeneficiaryFees(true, send_gas_to);
            }
            emit PairCodeUpgraded(new_version, new_type);

            TvmBuilder builder;

            builder.store(root);
            builder.store(vault);
            builder.store(current_version);
            builder.store(new_version);
            builder.store(send_gas_to);
            builder.store(DexPoolTypes.STABLESWAP);

            builder.store(platform_code);  // ref1 = platform_code

            //Tokens
            TvmBuilder tokens_data_builder;
            tokens_data_builder.store(tokenData[0].root);
            tokens_data_builder.store(tokenData[1].root);
            builder.storeRef(tokens_data_builder);  // ref2

            TvmCell other_data = abi.encode(
                lp_root,
                lp_wallet,
                lp_supply,

                fee,
                tokenData,
                A,
                PRECISION
            );

            builder.store(other_data);   // ref3

            // set code after complete this method
            tvm.setcode(code);

            // run onCodeUpgrade from new code
            tvm.setCurrentCode(code);
            onCodeUpgrade(builder.toCell());
        }
    }

    function onCodeUpgrade(TvmCell upgrade_data) private {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        tvm.resetStorage();
        TvmSlice s = upgrade_data.toSlice();

        address send_gas_to;
        uint32 old_version;
        uint8 old_pool_type = DexPoolTypes.CONSTANT_PRODUCT;

        (root, vault, old_version, current_version, send_gas_to) = s.decode(address, address, uint32, uint32, address);

        if (s.bits() >= 8) {
            old_pool_type = s.decode(uint8);
        }

        platform_code = s.loadRef(); // ref 1

        if (old_version == 0) {
            TvmSlice tokens_data_slice = s.loadRefAsSlice(); // ref 2

            (address left_root, address right_root) = tokens_data_slice.decode(address, address);
            tokenIndex[left_root] = 0;
            tokenIndex[right_root] = 1;

            fee = FeeParams(1000000, 3000, 0, 0, address(0), emptyMap, emptyMap);
            A = AmplificationCoefficient(200, 1);

            tokenData = new PoolTokenData[](N_COINS);
            tokenData[0] = PoolTokenData(left_root, address(0), 0, 0, 0, 0, 0, false, false);
            tokenData[1] = PoolTokenData(right_root, address(0), 0, 0, 0, 0, 0, false, false);

            IDexRoot(root).addLiquidityToken{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                address(this),
                _tokenRoots(),
                send_gas_to
            );
        } else if (old_pool_type == DexPoolTypes.STABLESWAP) {
            TvmSlice tokens_data_slice = s.loadRefAsSlice(); // ref 2

            (address left_root, address right_root) = tokens_data_slice.decode(address, address);
            tokenIndex[left_root] = 0;
            tokenIndex[right_root] = 1;

            TvmCell otherData = s.loadRef(); // ref 3

            FeeParamsPrev fee_prev;
            PoolTokenDataPrev[] tokenDataPrev;

            (
                lp_root, lp_wallet, lp_supply,
                fee_prev,
                tokenDataPrev,
                A, PRECISION
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParamsPrev,
                PoolTokenDataPrev[],
                AmplificationCoefficient,
                uint256
            ));

            fee = FeeParams(fee_prev.denominator, fee_prev.pool_numerator, fee_prev.beneficiary_numerator, 0, fee_prev.beneficiary, fee_prev.threshold, emptyMap);

            tokenData.push(PoolTokenData(tokenDataPrev[0].root, tokenDataPrev[0].wallet, tokenDataPrev[0].balance, tokenDataPrev[0].decimals, tokenDataPrev[0].accumulatedFee, tokenDataPrev[0].rate, tokenDataPrev[0].precisionMul, tokenDataPrev[0].decimalsLoaded, tokenDataPrev[0].initialized));
            tokenData.push(PoolTokenData(tokenDataPrev[1].root, tokenDataPrev[1].wallet, tokenDataPrev[1].balance, tokenDataPrev[1].decimals, tokenDataPrev[1].accumulatedFee, tokenDataPrev[1].rate, tokenDataPrev[1].precisionMul, tokenDataPrev[1].decimalsLoaded, tokenDataPrev[1].initialized));

            active = lp_wallet.value != 0 && tokenData[0].initialized && tokenData[1].initialized;
        } else if (old_pool_type == DexPoolTypes.CONSTANT_PRODUCT) {
            active = false;
            A = AmplificationCoefficient(200, 1);

            mapping(uint8 => uint128[]) type_to_reserves;
            mapping(uint8 => address[]) type_to_root_addresses;
            mapping(uint8 => address[]) type_to_wallet_addresses;

            TvmCell otherData = s.loadRef(); // ref 2
            (
                fee,
                type_to_reserves,
                type_to_root_addresses,
                type_to_wallet_addresses
            ) = abi.decode(otherData, (
                FeeParams,
                mapping(uint8 => uint128[]),
                mapping(uint8 => address[]),
                mapping(uint8 => address[])
            ));

            lp_root = type_to_root_addresses[DexAddressType.LP][0];
            lp_wallet = type_to_wallet_addresses[DexAddressType.LP][0];
            lp_supply = type_to_reserves[DexReserveType.LP][0];

            tokenIndex[type_to_root_addresses[DexAddressType.RESERVE][0]] = 0;
            tokenIndex[type_to_root_addresses[DexAddressType.RESERVE][1]] = 1;

            tokenData = new PoolTokenData[](N_COINS);
            tokenData[0] = PoolTokenData(type_to_root_addresses[DexAddressType.RESERVE][0], type_to_wallet_addresses[DexAddressType.RESERVE][0], type_to_reserves[DexReserveType.POOL][0], 0, type_to_reserves[DexReserveType.FEE][0], 0, 0, false, false);
            tokenData[1] = PoolTokenData(type_to_root_addresses[DexAddressType.RESERVE][1], type_to_wallet_addresses[DexAddressType.RESERVE][1], type_to_reserves[DexReserveType.POOL][1], 0, type_to_reserves[DexReserveType.FEE][1], 0, 0, false, false);

            ITokenRoot(type_to_root_addresses[DexAddressType.RESERVE][0]).decimals{
                value: DexGas.GET_TOKEN_DECIMALS_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexStablePair.onTokenDecimals
            }();
            ITokenRoot(type_to_root_addresses[DexAddressType.RESERVE][1]).decimals{
                value: DexGas.GET_TOKEN_DECIMALS_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexStablePair.onTokenDecimals
            }();
        } else if (old_pool_type == DexPoolTypes.STABLE_POOL) {
            TvmCell tokens_data_cell = s.loadRef(); // ref 2
            address[] roots = abi.decode(tokens_data_cell, address[]);

            tokenIndex[roots[0]] = 0;
            tokenIndex[roots[1]] = 1;

            TvmCell otherData = s.loadRef(); // ref 3

            (
                lp_root, lp_wallet, lp_supply,
                fee,
                tokenData,
                A, PRECISION
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                PoolTokenData[],
                AmplificationCoefficient,
                uint256
            ));

            active = lp_wallet.value != 0 && tokenData[0].initialized && tokenData[1].initialized;
        }

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
    }

    function _configureToken(address token_root) private view {
        ITokenRoot(token_root).deployWallet {
            value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: DexStablePair.onTokenWallet
        }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        if (token_root != lp_root) {
           ITokenRoot(token_root).decimals{
                value: DexGas.GET_TOKEN_DECIMALS_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexStablePair.onTokenDecimals
           }();
        }
    }

    function onTokenWallet(address wallet) external {
        require(tokenIndex.exists(msg.sender) || msg.sender == lp_root, DexErrors.NOT_ROOT);

        if (msg.sender == lp_root && lp_wallet.value == 0) {
            lp_wallet = wallet;
            active = tokenData[0].initialized && tokenData[1].initialized;
        } else {
            tokenData[tokenIndex[msg.sender]].wallet = wallet;
        }
    }

    function onTokenDecimals(uint8 _decimals) external {
        require(tokenIndex.exists(msg.sender), DexErrors.NOT_ROOT);

        tokenData[tokenIndex[msg.sender]].decimals = _decimals;
        tokenData[tokenIndex[msg.sender]].decimalsLoaded = true;

        bool allDecimalsLoaded = true;

        for (uint8 _i = 0; _i < N_COINS; _i++) {
            allDecimalsLoaded = allDecimalsLoaded && tokenData[_i].decimalsLoaded;
        }

        if (allDecimalsLoaded) {
            _initializeTokenData();
        }
    }

    function _initializeTokenData() internal {
        uint8 maxDecimals = 0;

        for (uint8 _i = 0; _i < N_COINS; _i++) {
            maxDecimals = math.max(maxDecimals, tokenData[_i].decimals);
        }

        PRECISION = uint256(10) ** uint256(maxDecimals);

        for (uint8 _i = 0; _i < N_COINS; _i++) {
            tokenData[_i].precisionMul = uint256(10) ** uint256(maxDecimals - tokenData[_i].decimals);
            tokenData[_i].rate = tokenData[_i].precisionMul * PRECISION;
            tokenData[_i].initialized = true;
        }

        active = lp_wallet.value != 0;
    }

    function liquidityTokenRootDeployed(address lp_root_, address send_gas_to) override external onlyRoot {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        lp_root = lp_root_;

        _configureToken(lp_root);
        _configureToken(tokenData[0].root);
        _configureToken(tokenData[1].root);

        IDexRoot(root)
            .onPoolCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            ([tokenData[0].root, tokenData[1].root], DexPoolTypes.STABLESWAP, send_gas_to);
    }

    function liquidityTokenRootNotDeployed(address /*lp_root_*/, address send_gas_to) override external onlyRoot {
        if (!active) send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO, bounce: false});
        else {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
            send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false});
        }
    }

    function getVirtualPrice() override external view responsible returns (optional(uint256)) {
        optional(uint256) result;

        if (lp_supply != 0) {
            uint256[] xp = new uint256[](0);

            for (PoolTokenData t: tokenData) {
                xp.push(math.muldiv(t.rate, t.balance, PRECISION));
            }

            optional(uint256) D_opt = _get_D(xp);

            if (D_opt.hasValue()) {
                uint256 value = uint256(math.muldiv(D_opt.get(), 10**18, lp_supply));
                result.set(math.muldiv(value, 10**9, PRECISION));
            }
        }

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } result;
    }

    function getPriceImpact(
        uint128 amount,
        address spent_token_root,
        uint128 price_amount
    ) external view returns (optional(uint256)) {
        optional(uint256) result;

        if (tokenIndex.exists(spent_token_root) && price_amount != 0 && amount != 0) {

            uint8 i = tokenIndex[spent_token_root];
            uint8 j = i == 0 ? 1 : 0;

            uint128[] reserves_mem = _reserves();
            uint256[] xp_mem = _xp_mem(reserves_mem);

            (optional(ExpectedExchangeResult) old_price_res,) =
                _get_dy_mem(i, j, price_amount, xp_mem, address(0));

            (optional(ExpectedExchangeResult) dy_result_opt,) =
                _get_dy_mem(i, j, amount, xp_mem, address(0));

            if (
                dy_result_opt.hasValue() &&
                old_price_res.hasValue()
            ) {
                uint128 old_price = old_price_res.get().amount;
                ExpectedExchangeResult dy_result = dy_result_opt.get();

                reserves_mem[i] += amount - dy_result.beneficiary_fee;
                reserves_mem[j] -= dy_result.amount;

                (optional(ExpectedExchangeResult) new_price_res,) =
                    _get_dy_mem(i, j, price_amount, _xp_mem(reserves_mem), address(0));

                if (new_price_res.hasValue()) {
                    result.set(
                        math.muldiv(
                            uint256(old_price - new_price_res.get().amount),
                            10**20,
                            old_price
                        )
                    );
                }
            }
        }

        return result;
    }

    // Stable math ##############################################
    function _get_D(uint256[] _xp) internal view returns(optional(uint256)) {
        optional(uint256) result;

        uint256 S = 0;
        uint256 Dprev = 0;

        for (uint256 _x: _xp) {
            S += _x;
        }
        if (S == 0) {
            result.set(0);
            return result;
        }

        uint256 D = S;
        uint256 Ann = A.value * N_COINS;

        for (uint8 _i = 0; _i <= 255; _i++) {
            uint256 D_P = D;
            for (uint256 _x : _xp) {
                D_P = math.muldiv(D_P, D, _x * N_COINS);
            }
            Dprev = D;
            D = math.muldiv(
                math.muldiv(Ann, S, A.precision) + D_P * N_COINS,
                D,
                (math.muldiv(Ann - A.precision, D, A.precision) + (N_COINS + 1) * D_P)
            );
            if ((D > Dprev ? (D - Dprev) : (Dprev - D)) <= 1) {
                result.set(D);
                return result;
            }
        }
        return result;
    }

    function _get_y(uint8 i, uint8 j, uint256 x, uint256[] _xp) internal view returns(optional(uint128)){
        optional(uint128) result;
        optional(uint256) D_opt = _get_D(_xp);
        if (!D_opt.hasValue() || i == j || i >= N_COINS || j >= N_COINS) {
            return result;
        }

        uint256 D = D_opt.get();
        uint256 Ann = A.value * N_COINS;
        uint256 c = D;
        uint256 S = 0;
        uint256 _x = 0;
        uint256 y_prev = 0;

        for (uint8 _i = 0; _i < N_COINS; _i++) {
            if (_i == i) {
                _x = x;
                S += _x;
                c = math.muldiv(c, D, _x * N_COINS);
            } else if(_i != j) {
                _x = _xp[_i];
                S += _x;
                c = math.muldiv(c, D, _x * N_COINS);
            }
        }

        c = math.muldiv(c, D * A.precision, (Ann * N_COINS));
        uint256 b = S + math.muldiv(D, A.precision, Ann);
        uint256 y = D;

        for (uint8 _i = 0; _i <= 255; _i++) {
            y_prev = y;
            y = (y*y + c) / (2 * y + b - D);
            if ((y > y_prev ? (y - y_prev) : (y_prev - y)) <= 1) {
                result.set(uint128(y));
                break;
            }
        }

        return result;
    }

    function _xp_mem(uint128[] _balances) internal view returns(uint256[]) {
        uint256[] result = new uint256[](0);

        for (uint8 i = 0; i < N_COINS; i++) {
            result.push(math.muldiv(tokenData[i].rate, _balances[i], PRECISION));
        }

        return result;
    }

    struct ExpectedExchangeResult {
        uint128 amount;
        uint128 pool_fee;
        uint128 beneficiary_fee;
    }


    function _get_dy(uint8 i, uint8 j, uint128 _dx, address referrer) internal view returns (optional(ExpectedExchangeResult), uint128) {
        uint256[] xp = new uint256[](0);

        for (PoolTokenData t: tokenData) {
            xp.push(math.muldiv(t.rate, t.balance, PRECISION));
        }

        return _get_dy_mem(i, j, _dx, xp, referrer);
    }

    function _get_dy_mem(uint8 i, uint8 j, uint128 _dx, uint256[] xp, address referrer) internal view returns (optional(ExpectedExchangeResult), uint128) {
        optional(ExpectedExchangeResult) result;

        uint128 fee_numerator = fee.pool_numerator + fee.beneficiary_numerator + fee.referrer_numerator;
        uint128 x_fee = math.muldivc(_dx, fee_numerator, fee.denominator);
        uint128 x_referrer_fee = math.muldiv(x_fee, fee.referrer_numerator, fee_numerator);
        uint128 x_beneficiary_fee;
        uint128 x_pool_fee;

        if (referrer.value != 0 && (
            !fee.referrer_threshold.exists(tokenData[i].root) ||
            fee.referrer_threshold[tokenData[i].root] <= x_referrer_fee
        )) {
            x_beneficiary_fee = math.muldiv(x_fee, fee.beneficiary_numerator, fee_numerator);
            x_pool_fee = x_fee - x_referrer_fee - x_beneficiary_fee;
        } else {
            x_referrer_fee = 0;
            x_beneficiary_fee = math.muldiv(x_fee, fee.beneficiary_numerator, fee.beneficiary_numerator + fee.pool_numerator);
            x_pool_fee = x_fee - x_beneficiary_fee;
        }

        uint256 x = xp[i] + math.muldiv(_dx - x_fee, tokenData[i].rate, PRECISION);
        optional(uint256) y_opt = _get_y(i, j, x, xp);

        if (y_opt.hasValue()) {
            uint128 dy = uint128(math.muldiv(xp[j] - y_opt.get(), PRECISION, tokenData[j].rate));
            if (
                dy <= tokenData[j].balance &&
                dy > 0 &&
                (x_pool_fee > 0 || fee.pool_numerator == 0) &&
                (x_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
            ) {
                result.set(ExpectedExchangeResult(
                    dy,
                    x_pool_fee,
                    x_beneficiary_fee
                ));
            }
        }

        return (result, result.hasValue() ? x_referrer_fee : 0);
    }

    function _get_dx(uint8 i, uint8 j, uint128 _dy) internal view returns (optional(ExpectedExchangeResult)) {
        optional(ExpectedExchangeResult) result;

        if (_dy >= tokenData[j].balance || _dy == 0) {
            return result;
        }

        uint256[] xp = new uint256[](0);

        for (PoolTokenData t: tokenData) {
            xp.push(math.muldiv(t.rate, t.balance, PRECISION));
        }

        uint256 y = xp[j] - math.muldiv(_dy, tokenData[j].rate, PRECISION);
        optional(uint256) x_opt = _get_y(j, i, y, xp);

        if (x_opt.hasValue()) {
            uint128 fee_d_minus_n = uint128(fee.denominator - fee.pool_numerator - fee.beneficiary_numerator - fee.referrer_numerator);
            uint128 dx_raw = uint128(math.muldivc(x_opt.get() - xp[i], PRECISION, tokenData[i].rate));
            uint128 dx = math.muldivc(dx_raw, fee.denominator, fee_d_minus_n);

            uint128 x_fee = math.muldivc(dx, fee.pool_numerator + fee.beneficiary_numerator + fee.referrer_numerator, fee.denominator);

            uint128 x_beneficiary_fee = math.muldiv(x_fee, fee.beneficiary_numerator, fee.pool_numerator + fee.beneficiary_numerator);
            uint128 x_pool_fee = x_fee - x_beneficiary_fee;

            if (
                (x_pool_fee > 0 || fee.pool_numerator == 0) &&
                (x_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
            ) {
                result.set(ExpectedExchangeResult(
                    dx,
                    x_pool_fee,
                    x_beneficiary_fee
                ));
            }
        }

        return result;
    }

    function _tokenRoots() internal view returns(address[]) {
        address[] r = new address[](0);
        for (PoolTokenData t: tokenData) {
            r.push(t.root);
        }
        return r;
    }

    function _reserves() internal view returns(uint128[]) {
        uint128[] r = new uint128[](0);
        for (PoolTokenData t: tokenData) {
            r.push(t.balance);
        }
        return r;
    }

    function _sync() internal view {
        emit Sync(_reserves(), lp_supply);
    }

    function _expectedDepositLiquidity(uint128[] _amounts, address referrer) private view returns(optional(DepositLiquidityResultV2), uint128[]) {
        optional(DepositLiquidityResultV2) result;

        uint128[] old_balances = _reserves();

        optional(uint256) D0_opt = _get_D(_xp_mem(old_balances));

        uint128[] new_balances = old_balances;
        uint128[] pool_fees = new uint128[](N_COINS);
        uint128[] beneficiary_fees = new uint128[](N_COINS);
        uint128[] referrer_fees = new uint128[](N_COINS);
        uint128[] result_balances = old_balances;
        uint128[] differences = new uint128[](N_COINS);
        uint128 lp_reward;
        bool[] sell = new bool[](N_COINS);

        bool hasZeroBalance = false;
        for (uint8 i = 0; i < N_COINS; i++) {
            hasZeroBalance = hasZeroBalance || _amounts[i] == 0;
            new_balances[i] += _amounts[i];

            //default
            differences[i] = 0;
            pool_fees[i] = 0;
            beneficiary_fees[i] = 0;
            referrer_fees[i] = 0;
            sell[i] = false;
        }

        optional(uint256) D1_opt = _get_D(_xp_mem(new_balances));

    //  # dev: initial deposit requires all coins
        if (lp_supply == 0 && hasZeroBalance || !D0_opt.hasValue() || !D1_opt.hasValue()) {
            return (result, referrer_fees);
        }

        uint256 D0 = D0_opt.get();
        uint256 D1 = D1_opt.get();

        if (D0 >= D1) {
            return (result, referrer_fees);
        }

        optional(uint256) D2_opt;

        if (lp_supply > 0) {
            uint128 fee_numerator = math.muldiv(fee.pool_numerator + fee.beneficiary_numerator + fee.referrer_numerator, N_COINS, (4 * (N_COINS - 1)));

            for (uint8 i = 0; i < N_COINS; i++) {
                uint128 ideal_balance = uint128(math.muldiv(D1, old_balances[i], D0));
                uint128 new_balance = new_balances[i];
                uint128 difference = ideal_balance > new_balance ? ideal_balance - new_balance : new_balance - ideal_balance;
                sell[i] = ideal_balance < new_balance;
                uint128 fees = math.muldivc(fee_numerator, difference, fee.denominator);
                uint128 referrer_fee = math.muldiv(fees, fee.referrer_numerator, fee.beneficiary_numerator + fee.pool_numerator + fee.referrer_numerator);

                if (referrer.value != 0 && (
                    !fee.referrer_threshold.exists(tokenData[i].root) ||
                    fee.referrer_threshold[tokenData[i].root] <= referrer_fee
                )) {
                    referrer_fees[i] = referrer_fee;
                    beneficiary_fees[i] = math.muldiv(fees, fee.beneficiary_numerator, fee.beneficiary_numerator + fee.pool_numerator + fee.referrer_numerator);
                    pool_fees[i] = fees - referrer_fee - beneficiary_fees[i];
                } else {
                    beneficiary_fees[i] = math.muldiv(fees, fee.beneficiary_numerator, fee.beneficiary_numerator + fee.pool_numerator);
                    pool_fees[i] = fees - beneficiary_fees[i];
                }

                result_balances[i] = new_balance - beneficiary_fees[i] - referrer_fees[i];
                new_balances[i] = new_balances[i] - pool_fees[i] - beneficiary_fees[i] - referrer_fees[i];
                differences[i] = difference;
            }
            D2_opt = _get_D(_xp_mem(new_balances));
            if (D2_opt.hasValue()) {
                lp_reward = uint128(math.muldiv(lp_supply, (D2_opt.get() - D0), D0));
            }
        } else {
            D2_opt.set(D1);
            result_balances = new_balances;
            lp_reward = uint128(D1);
        }

        if (!D2_opt.hasValue() || lp_reward == 0) {
            return (result, referrer_fees);
        }

        result.set(DepositLiquidityResultV2(
            old_balances,
            _amounts,
            lp_reward,
            result_balances,
            uint128(D1),
            differences,
            sell,
            pool_fees,
            beneficiary_fees
        ));

        return (result, referrer_fees);
    }

    function _applyAddLiquidity(
        DepositLiquidityResultV2 r,
        uint128[] referrer_fees,
        uint64 call_id,
        bool via_account,
        address sender_address,
        address recipient,
        address referrer,
        uint128 referrer_value,
        address original_gas_to
    ) private {

        address spent_root;
        uint128 spent_amount;
        address receive_root;
        uint128 receive_amount;
        ExchangeFee[] fees;
        TokenOperation[] referrer_fees_data;
        TokenOperation[] deposits;

        bool is_zero_referrer_fees = true;
        for (uint8 i = 0; i < N_COINS; i++) {
            if (r.differences[i] > 0) {
                fees.push(ExchangeFee(tokenData[i].root, r.pool_fees[i], r.beneficiary_fees[i], fee.beneficiary));
                if (r.sell[i]) {
                    deposits.push(TokenOperation(
                        r.result_balances[i] - tokenData[i].balance - r.differences[i] - r.pool_fees[i],
                        tokenData[i].root
                    ));
                    spent_root = tokenData[i].root;
                    spent_amount = r.differences[i];
                } else {
                    deposits.push(TokenOperation(
                        r.result_balances[i] + r.differences[i] - tokenData[i].balance - r.pool_fees[i],
                        tokenData[i].root
                    ));
                    receive_root = tokenData[i].root;
                    receive_amount = r.differences[i];
                }
            } else {
                deposits.push(TokenOperation(r.result_balances[i] - tokenData[i].balance, tokenData[i].root));
            }

            tokenData[i].balance = r.result_balances[i];
            tokenData[i].accumulatedFee += r.beneficiary_fees[i];

            referrer_fees_data.push(TokenOperation(referrer_fees[i], tokenData[i].root));

            if (referrer_fees[i] > 0) {
                is_zero_referrer_fees = false;

                IDexTokenVault(_expectedTokenVaultAddress(tokenData[i].root)).referralFeeTransfer{
                    value: referrer_value,
                    flag: MsgFlag.SENDER_PAYS_FEES
                }(
                    referrer_fees[i],
                    referrer,
                    original_gas_to,
                    _tokenRoots()
                );
            }
        }

        lp_supply += r.lp_reward;

        if (spent_root.value != 0 && receive_root.value != 0) {
            emit Exchange(
                sender_address,
                recipient,
                spent_root,
                spent_amount,
                receive_root,
                receive_amount,
                fees
            );

            if (!is_zero_referrer_fees) {
                emit ReferrerFees(referrer_fees_data);
            }
        }

        emit DepositLiquidity(sender_address, recipient, deposits, r.lp_reward);

        IDexPairOperationCallback(sender_address).dexPairDepositLiquiditySuccessV2{
            value: DexGas.OPERATION_CALLBACK_BASE + 2,
            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
            bounce: false
        }(call_id, via_account, r);

        if (recipient != sender_address) {
            IDexPairOperationCallback(recipient).dexPairDepositLiquiditySuccessV2{
                value: DexGas.OPERATION_CALLBACK_BASE,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, via_account, r);
        }
    }
}
