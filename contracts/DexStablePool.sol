pragma ton -solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IBurnableByRootTokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IBurnableTokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "./libraries/DexPlatformTypes.sol";
import "./libraries/DexPoolTypes.sol";
import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/PairPayload.sol";

import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexBasePool.sol";
import "./interfaces/ISuccessCallback.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IDexVault.sol";
import "./interfaces/IDexStablePool.sol";
import "./interfaces/IDexPairOperationCallback.sol";

import "./structures/IExchangeResultV2.sol";
import "./structures/IWithdrawResultV2.sol";
import "./structures/ITokenOperationStructure.sol";
import "./structures/IDepositLiquidityResultV2.sol";
import "./structures/IDexPoolBalances.sol";
import "./structures/IPoolTokenData.sol";
import "./structures/INextExchangeData.sol";

import "./abstract/DexContractBase.sol";
import "./DexPlatform.sol";
import "./TokenFactory.sol";

contract DexStablePool is
    DexContractBase,
    IDexStablePool,
    IPoolTokenData,
    INextExchangeData
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
    address lp_vault_wallet;
    uint128 lp_supply;

    // Fee
    FeeParams fee;

    AmplificationCoefficient A;
    uint8 N_COINS;

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

    function getTokenRoots() override external view responsible returns (address[] roots, address lp) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (_tokenRoots(), lp_root);
    }

    function getTokenWallets() override external view responsible returns (address[] token_wallets, address lp) {
        address[] w = new address[](0);
        for (uint8 i = 0; i < N_COINS; i++) {
            w.push(tokenData[i].wallet);
        }

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (w, lp_wallet);
    }

    function getVersion() override external view responsible returns (uint32 version) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } current_version;
    }

    function getPoolType() override external view responsible returns (uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPoolTypes.STABLESWAP;
    }

    function getVault() override external view responsible returns (address dex_vault) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } vault;
    }

    function getVaultWallets() override external view responsible returns (address[] token_vault_wallets, address lp) {
        address[] vw = new address[](0);

        for (uint8 i = 0; i < N_COINS; i++) {
            vw.push(tokenData[i].vaultWallet);
        }
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (vw, lp_vault_wallet);
    }

    function getAccumulatedFees() override external view responsible returns (uint128[] accumulatedFees) {
        uint128[] _accumulatedFees = new uint128[](0);

        for (uint8 i = 0; i < N_COINS; i++) {
            _accumulatedFees.push(tokenData[i].accumulatedFee);
        }

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } _accumulatedFees;
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

    function getBalances() override external view responsible returns (DexPoolBalances) {
        uint128[] balances = new uint128[](0);
        for (uint8 i = 0; i < N_COINS; i++) {
            balances.push(tokenData[i].balance);
        }
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPoolBalances(
            balances,
            lp_supply
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
        uint128 expected_amount,
        address outcoming,
        optional(address) recipient
    )  external pure returns (TvmCell) {
        return PairPayload.buildExchangePayloadV2(
            id,
            deploy_wallet_grams,
            recipient.hasValue() ? recipient.get() : address(0),
            expected_amount,
            outcoming
        );
    }

    function buildDepositLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        optional(uint128) expected_amount,
        optional(address) recipient
    ) external pure returns (TvmCell) {
        return PairPayload.buildDepositLiquidityPayload(
            id,
            deploy_wallet_grams,
            expected_amount.hasValue() ? expected_amount.get() : 0,
            recipient.hasValue() ? recipient.get() : address(0)
        );
    }

    function buildWithdrawLiquidityPayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        optional(uint128[]) expected_amounts,
        optional(address) recipient
    ) external view returns (TvmCell) {
        uint128[] expected ;
        if (expected_amounts.hasValue()) {
            expected = expected_amounts.get();
        }

        require(expected.length == 0 || expected.length == N_COINS);

        return PairPayload.buildWithdrawLiquidityPayload(
            id,
            deploy_wallet_grams,
            expected,
            recipient.hasValue() ? recipient.get() : address(0)
        );
    }

    function buildWithdrawLiquidityOneCoinPayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        address outcoming,
        optional(address) recipient
    ) external pure returns (TvmCell) {
        return PairPayload.buildWithdrawLiquidityOneCoinPayload(
            id,
            deploy_wallet_grams,
            recipient.hasValue() ? recipient.get() : address(0),
            expected_amount,
            outcoming
        );
    }

    function buildCrossPairExchangePayload(
        uint64 id,
        uint128 deployWalletGrams,
        uint128 expectedAmount,
        address outcoming,
        uint32[] nextStepIndices,
        ExchangeStep[] steps,
        optional(address) recipient
    ) external view returns (TvmCell) {
        address[] pools;

        // Calculate pools' addresses by token roots
        for (uint32 i = 0; i < steps.length; i++) {
            pools.push(_expectedPairAddress(steps[i].roots));
        }

        return PairPayload.buildCrossPairExchangePayloadV2(
            id,
            deployWalletGrams,
            recipient.hasValue() ? recipient.get() : address(0),
            expectedAmount,
            outcoming,
            nextStepIndices,
            steps,
            pools
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
            bool is_valid,
            uint8 op,
            uint64 id,
            uint128 deploy_wallet_grams,
            address recipient,
            uint128[] expected_amounts,
            address outcoming,
            NextExchangeData[] next_steps
        ) = PairPayload.decodeOnAcceptTokensTransferData(payload);

        uint128 expected_amount = 0;
        if (expected_amounts.length == 1) {
            expected_amount = expected_amounts[0];
        } else if (expected_amounts.length == 0) {
            expected_amounts = new uint128[](N_COINS);
        }

        // Set sender as recipient if it's empty
        recipient = recipient.value == 0 ? sender_address : recipient;

        // Decode payloads for callbacks
        (
            bool notify_success,
            TvmCell success_payload,
            bool notify_cancel,
            TvmCell cancel_payload,
            /*bool hasRef3*/,
            /*TvmCell ref3*/
        ) = PairPayload.decodeOnAcceptTokensTransferPayloads(payload, op);

        TvmCell empty;

        bool need_cancel = !active ||
        !is_valid ||
        lp_supply == 0 ||
        msg.sender.value == 0 ||
        msg.value < DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deploy_wallet_grams;

        if (token_root == lp_root) {
            need_cancel = need_cancel || msg.sender != lp_wallet;
        } else {
            need_cancel = need_cancel ||
            !tokenIndex.exists(token_root) ||
            msg.sender != tokenData[tokenIndex.at(token_root)].wallet;
        }

        if (!need_cancel) {
            if (msg.sender == lp_wallet &&
                (op == DexOperationTypes.WITHDRAW_LIQUIDITY || op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) &&
                msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + N_COINS * deploy_wallet_grams) {

                optional(WithdrawResultV2) result_opt = _expectedWithdrawLiquidity(tokens_amount);

                if (result_opt.hasValue()) {
                    WithdrawResultV2 result = result_opt.get();

                    for (uint8 ii = 0; ii < N_COINS; ii++) {
                        if (result.amounts[ii] < expected_amounts[ii]) {
                            need_cancel = true;
                        }
                    }

                    if (!need_cancel) {
                        _applyWithdrawLiquidity(result, id, false, sender_address, recipient);

                        for (uint8 ii = 0; ii < N_COINS; ii++) {
                            if (result.amounts[ii] >= 0) {
                                IDexVault(vault).transferV2{
                                    value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deploy_wallet_grams,
                                    flag: MsgFlag.SENDER_PAYS_FEES
                                }(
                                    result.amounts[ii],
                                    tokenData[ii].root,
                                    tokenData[ii].vaultWallet,
                                    recipient,
                                    deploy_wallet_grams,
                                    notify_success,
                                    success_payload,
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
                    need_cancel = true;
                }
            } else if (msg.sender == lp_wallet && op == DexOperationTypes.WITHDRAW_LIQUIDITY_ONE_COIN) {

                optional(WithdrawResultV2) result_opt;

                uint8 i = tokenIndex[outcoming];

                if (tokenIndex.exists(outcoming)) {
                    result_opt = _expectedWithdrawLiquidityOneCoin(tokens_amount, i);
                }

                if (result_opt.hasValue()) {
                    WithdrawResultV2 result = result_opt.get();

                    if (result.amounts[i] < expected_amount) {
                        need_cancel = true;
                    } else {
                        _applyWithdrawLiquidity(result, id, false, sender_address, recipient);

                        IDexVault(vault).transferV2{
                            value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deploy_wallet_grams,
                            flag: MsgFlag.SENDER_PAYS_FEES
                        }(
                            result.amounts[i],
                            tokenData[i].root,
                            tokenData[i].vaultWallet,
                            recipient,
                            deploy_wallet_grams,
                            notify_success,
                            success_payload,
                            _tokenRoots(),
                            current_version,
                            original_gas_to
                        );

                        IBurnableTokenWallet(msg.sender).burn{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                            tokens_amount,
                            original_gas_to,
                            address.makeAddrStd(0, 0),
                            empty);
                    }
                } else {
                    need_cancel = true;
                }
            } else if (msg.sender != lp_wallet && op == DexOperationTypes.EXCHANGE) {

                optional(ExpectedExchangeResult) dy_result_opt;

                if (tokenIndex.exists(outcoming)) {
                    dy_result_opt = _get_dy(tokenIndex[token_root], tokenIndex[outcoming], tokens_amount);
                }

                if (!dy_result_opt.hasValue() || dy_result_opt.get().amount < expected_amount) {
                    need_cancel = true;
                } else {
                    uint8 i = tokenIndex[token_root];
                    uint8 j = tokenIndex[outcoming];

                    ExpectedExchangeResult dy_result = dy_result_opt.get();

                    tokenData[i].balance += tokens_amount - dy_result.beneficiary_fee;
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

                    IDexPairOperationCallback(sender_address).dexPairExchangeSuccessV2{
                        value: DexGas.OPERATION_CALLBACK_BASE + 10,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(id, false, IExchangeResultV2.ExchangeResultV2(
                            token_root,
                            outcoming,
                            tokens_amount,
                            dy_result.pool_fee + dy_result.beneficiary_fee,
                            dy_result.amount
                        ));

                    if (recipient != sender_address) {
                        IDexPairOperationCallback(recipient).dexPairExchangeSuccessV2{
                            value: DexGas.OPERATION_CALLBACK_BASE,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResultV2.ExchangeResultV2(
                            token_root,
                            outcoming,
                            tokens_amount,
                            dy_result.pool_fee + dy_result.beneficiary_fee,
                            dy_result.amount
                        ));
                    }

                    ITokenWallet(msg.sender).transfer{
                        value: DexGas.TRANSFER_TOKENS_VALUE,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        tokens_amount,
                        vault,
                        0,
                        original_gas_to,
                        false,
                        empty
                    );

                    IDexVault(vault).transferV2{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        dy_result.amount,
                        tokenData[j].root,
                        tokenData[j].vaultWallet,
                        recipient,
                        deploy_wallet_grams,
                        notify_success,
                        success_payload,
                        _tokenRoots(),
                        current_version,
                        original_gas_to
                    );
                }
            } else if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2 && next_steps.length > 0) {

                TokenOperation operation;

                uint256 denominator = 0;
                for (NextExchangeData next_step: next_steps) {
                    if (next_step.poolRoot.value == 0 || next_step.poolRoot == address(this) ||
                        next_step.numerator == 0 || next_step.leaves == 0) {

                        need_cancel = true;
                    }
                    denominator += next_step.numerator;
                }

                if (!need_cancel) {
                    if (outcoming == lp_root && token_root != lp_root) { // deposit liquidity
                        uint128[] amounts = new uint128[](N_COINS);
                        amounts[tokenIndex[token_root]] = tokens_amount;
                        optional(DepositLiquidityResultV2) resultOpt = _expectedDepositLiquidity(amounts);

                        if (!resultOpt.hasValue() || resultOpt.get().lp_reward < expected_amount) {
                            need_cancel = true;
                        } else {
                            DepositLiquidityResultV2 result = resultOpt.get();
                            _applyAddLiquidity(result, id, false, sender_address, recipient);

                            TvmBuilder builder;
                            builder.store(lp_vault_wallet);

                            TvmCell exchange_data = abi.encode(
                                id,
                                current_version,
                                DexPoolTypes.STABLESWAP,
                                _tokenRoots(),
                                sender_address,
                                recipient,
                                deploy_wallet_grams,
                                next_steps
                            );
                            builder.store(exchange_data);

                            builder.store(success_payload);
                            builder.store(cancel_payload);

                            ITokenRoot(lp_root).mint{
                                value: 0,
                                flag: MsgFlag.ALL_NOT_RESERVED
                            }(
                                result.lp_reward,
                                vault,
                                deploy_wallet_grams,
                                original_gas_to,
                                true,
                                builder.toCell()
                            );
                        }
                    } else if (token_root == lp_root) { // withdraw liquidity

                        optional(WithdrawResultV2) result_opt;

                        if (tokenIndex.exists(outcoming)) {
                            result_opt = _expectedWithdrawLiquidityOneCoin(tokens_amount, tokenIndex[outcoming]);
                        }

                        if (!result_opt.hasValue() || result_opt.get().amounts[tokenIndex[outcoming]] < expected_amount) {
                            need_cancel = true;
                        } else {
                            WithdrawResultV2 result = result_opt.get();
                            uint8 j = tokenIndex[outcoming];

                            _applyWithdrawLiquidity(result, id, false, sender_address, recipient);

                            operation = TokenOperation(result.amounts[j], tokenData[j].root);

                            IBurnableTokenWallet(msg.sender).burn{
                                value: DexGas.BURN_VALUE,
                                flag: MsgFlag.SENDER_PAYS_FEES
                            }(
                                tokens_amount,
                                original_gas_to,
                                address.makeAddrStd(0, 0),
                                empty);
                        }
                    } else { // exchange
                        optional(ExpectedExchangeResult) dy_result_opt;

                        if (tokenIndex.exists(outcoming) && token_root != outcoming) {
                            dy_result_opt = _get_dy(tokenIndex[token_root], tokenIndex[outcoming], tokens_amount);
                        }

                        if (
                            !dy_result_opt.hasValue() ||
                            dy_result_opt.get().amount < expected_amount
                        ) {
                            need_cancel = true;
                        } else {
                            uint8 i = tokenIndex[token_root];
                            uint8 j = tokenIndex[outcoming];

                            ExpectedExchangeResult dy_result = dy_result_opt.get();
                            operation = TokenOperation(dy_result.amount, tokenData[j].root);

                            tokenData[i].balance += tokens_amount - dy_result.beneficiary_fee;
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
                        }
                    }
                }

                if (!need_cancel) {
                    if (token_root != lp_root) { // deposit or exchange
                        ITokenWallet(msg.sender).transfer{
                            value: DexGas.TRANSFER_TOKENS_VALUE,
                            flag: MsgFlag.SENDER_PAYS_FEES
                        }(
                            tokens_amount,
                            vault,
                            0,
                            original_gas_to,
                            false,
                            empty
                        );
                    }

                    if (outcoming != lp_root) { // withdraw or exchange
                        uint128 value = 0;
                        uint8 flag = MsgFlag.ALL_NOT_RESERVED;

                        for (NextExchangeData next_step: next_steps) {
                            uint128 next_pool_amount = uint128(math.muldiv(operation.amount, next_step.numerator, denominator));

                            if (next_steps.length > 1) {
                                value = next_step.nestedNodes * DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + next_step.leaves * DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2;
                                flag = MsgFlag.SENDER_PAYS_FEES;
                            }

                            IDexBasePool(next_step.poolRoot).crossPoolExchange{
                                value: value,
                                flag: flag
                            }(
                                id,

                                current_version,
                                DexPoolTypes.STABLESWAP,

                                _tokenRoots(),

                                op,
                                operation.root,
                                next_pool_amount,

                                sender_address,
                                recipient,

                                original_gas_to,
                                deploy_wallet_grams,

                                next_step.payload,
                                notify_success,
                                success_payload,
                                notify_cancel,
                                cancel_payload
                            );
                        }

                        if (next_steps.length > 1) {
                            original_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
                        }
                    }
                }
            } else if (msg.sender != lp_wallet && op == DexOperationTypes.DEPOSIT_LIQUIDITY
                && msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deploy_wallet_grams) {
                uint128[] amounts = new uint128[](N_COINS);
                amounts[tokenIndex[token_root]] = tokens_amount;
                optional(DepositLiquidityResultV2) resultOpt = _expectedDepositLiquidity(amounts);

                if (!resultOpt.hasValue() || resultOpt.get().lp_reward < expected_amount) {
                    need_cancel = true;
                } else {
                    DepositLiquidityResultV2 result = resultOpt.get();
                    _applyAddLiquidity(result, id, false, sender_address, recipient);

                    ITokenWallet(msg.sender).transfer{
                        value: DexGas.TRANSFER_TOKENS_VALUE,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        tokens_amount,
                        vault,
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
                        success_payload
                    );
                }
            } else {
                need_cancel = true;
            }
        }

        if (need_cancel) {
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

            ITokenWallet(msg.sender).transferToWallet{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                tokens_amount,
                sender_wallet,
                original_gas_to,
                notify_cancel,
                cancel_payload
            );
        } else {
            _sync();
        }
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deposit liquidity

    function expectedDepositLiquidityV2(
        uint128[] amounts
    ) override external view responsible returns (DepositLiquidityResultV2) {
        optional(DepositLiquidityResultV2) resultOpt = _expectedDepositLiquidity(amounts);
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
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        require(_expected.root == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);

        bool anyGreaterThanZero = false;
        bool allGreaterThanZero = true;
        for (TokenOperation op: _operations) {
            if (op.amount > 0) {
                anyGreaterThanZero = true;
            } else {
                allGreaterThanZero = false;
            }
        }

        require(lp_supply != 0 || allGreaterThanZero, DexErrors.WRONG_LIQUIDITY);
        require(allGreaterThanZero || (auto_change && anyGreaterThanZero), DexErrors.AMOUNT_TOO_LOW);

        uint128[] amounts = new uint128[](0);
        for (TokenOperation op: _operations) {
            amounts.push(op.amount);
        }
        optional(DepositLiquidityResultV2) resultOpt = _expectedDepositLiquidity(amounts);
        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);
        DepositLiquidityResultV2 result = resultOpt.get();
        require(result.lp_reward >= _expected.amount, DexErrors.WRONG_LIQUIDITY);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        _applyAddLiquidity(result, call_id, true, account_owner, account_owner);

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

    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) override external view responsible returns (WithdrawResultV2) {
        optional(WithdrawResultV2) resultOpt = _expectedWithdrawLiquidity(lp_amount);
        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS} resultOpt.get();
    }

    function expectedWithdrawLiquidityOneCoin(
        uint128 lp_amount,
        address outcoming
    ) override external view responsible returns (WithdrawResultV2) {
        require(tokenIndex.exists(outcoming), DexErrors.NOT_TOKEN_ROOT);

        optional(WithdrawResultV2) resultOpt = _expectedWithdrawLiquidityOneCoin(lp_amount, tokenIndex[outcoming]);
        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } resultOpt.get();
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

        optional(WithdrawResultV2) resultOpt;
        if (_expected.length == 1) {
            resultOpt = _expectedWithdrawLiquidityOneCoin(_operation.amount, tokenIndex[_expected[0].root]);
        } else {
            resultOpt = _expectedWithdrawLiquidity(_operation.amount);
        }

        require(resultOpt.hasValue(), DexErrors.WRONG_LIQUIDITY);
        WithdrawResultV2 result = resultOpt.get();

        for (TokenOperation expected: _expected) {
            require(expected.amount > result.amounts[tokenIndex[expected.root]], DexErrors.WRONG_LIQUIDITY);
        }

        _applyWithdrawLiquidity(result, call_id, true, account_owner, account_owner);

        _sync();

        for (uint8 i = 0; i < N_COINS; i++) {
            if (result.amounts[i] >= 0) {
                IDexAccount(msg.sender)
                    .internalPoolTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    result.amounts[i],
                    tokenData[i].root,
                    _tokenRoots(),
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
            vault,
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
        address spent_token_root,
        address receive_token_root
    ) override external view responsible returns (uint128 expected_amount, uint128 expected_fee) {
        require(tokenIndex.exists(spent_token_root) && tokenIndex.exists(receive_token_root), DexErrors.NOT_TOKEN_ROOT);
        uint8 i = tokenIndex[spent_token_root];
        uint8 j = tokenIndex[receive_token_root];
        optional(ExpectedExchangeResult) dy_result_opt = _get_dy(i, j, amount);
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
        address receive_token_root,
        address spent_token_root
    ) override external view responsible returns (uint128 expected_amount, uint128 expected_fee) {
        require(tokenIndex.exists(receive_token_root) && tokenIndex.exists(spent_token_root), DexErrors.NOT_TOKEN_ROOT);
        uint8 j = tokenIndex[receive_token_root];
        uint8 i = tokenIndex[spent_token_root];
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
        optional(ExpectedExchangeResult) dy_result_opt = _get_dy(i, j, _operation.amount);
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

        IDexPairOperationCallback(account_owner).dexPairExchangeSuccessV2{
            value: DexGas.OPERATION_CALLBACK_BASE + 1,
            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
            bounce: false
        }(call_id, true, IExchangeResultV2.ExchangeResultV2(
            _operation.root,
            _expected.root,
            _operation.amount,
            dy_result.pool_fee + dy_result.beneficiary_fee,
            dy_result.amount
        ));

        IDexAccount(msg.sender)
            .internalPoolTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
        (
            dy_result.amount,
            _expected.root,
            _tokenRoots(),
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
                IDexAccount(beneficiaryAccount).internalPoolTransfer{
                    value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                    flag: MsgFlag.SENDER_PAYS_FEES
                }(
                    tokenData[i].accumulatedFee,
                    tokenData[i].root,
                    _tokenRoots(),
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

        address original_gas_to,
        uint128 deploy_wallet_grams,

        TvmCell payload,
        bool notify_success,
        TvmCell success_payload,
        bool notify_cancel,
        TvmCell cancel_payload
    ) override external onlyPairOrVault(prev_pool_token_roots) {
        require(tokenIndex.exists(spent_token_root) || spent_token_root == lp_root, DexErrors.NOT_TOKEN_ROOT);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        (
            uint128 expected_amount,
            address outcoming,
            NextExchangeData[] next_steps
        ) = PairPayload.decodeCrossPoolExchangePayload(payload, op);

        TvmCell empty;

        bool need_cancel = !active || msg.sender == address(this);

        if (!need_cancel) {
            TokenOperation operation;

            if (outcoming == lp_root && spent_token_root != lp_root) { // deposit liquidity
                uint128[] amounts = new uint128[](N_COINS);
                amounts[tokenIndex[spent_token_root]] = spent_amount;
                optional(DepositLiquidityResultV2) resultOpt = _expectedDepositLiquidity(amounts);

                if (!resultOpt.hasValue() || resultOpt.get().lp_reward < expected_amount) {
                    need_cancel = true;
                } else {
                    DepositLiquidityResultV2 result = resultOpt.get();
                    _applyAddLiquidity(result, id, false, sender_address, recipient);

                    TvmBuilder builder;
                    builder.store(lp_vault_wallet);

                    TvmCell exchange_data = abi.encode(
                        id,
                        current_version,
                        DexPoolTypes.STABLESWAP,
                        _tokenRoots(),
                        sender_address,
                        recipient,
                        deploy_wallet_grams,
                        next_steps
                    );
                    builder.store(exchange_data);

                    builder.store(success_payload);
                    builder.store(cancel_payload);

                    ITokenRoot(lp_root).mint{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        result.lp_reward,
                        vault,
                        deploy_wallet_grams,
                        original_gas_to,
                        true,
                        builder.toCell()
                    );
                }
            } else if (spent_token_root == lp_root) { // withdraw liquidity
                optional(WithdrawResultV2) result_opt;

                if (tokenIndex.exists(outcoming)) {
                    result_opt = _expectedWithdrawLiquidityOneCoin(spent_amount, tokenIndex[outcoming]);
                }

                if (!result_opt.hasValue() || result_opt.get().amounts[tokenIndex[outcoming]] < expected_amount) {
                    need_cancel = true;
                } else {
                    WithdrawResultV2 result = result_opt.get();
                    uint8 j = tokenIndex[outcoming];

                    _applyWithdrawLiquidity(result, id, false, sender_address, recipient);

                    operation = TokenOperation(result.amounts[j], tokenData[j].root);

                    IDexVault(vault).burn{
                        value: DexGas.BURN_VALUE,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        _tokenRoots(),
                        lp_vault_wallet,
                        spent_amount,
                        original_gas_to,
                        address.makeAddrStd(0, 0),
                        empty
                    );
                }
            } else { // exchange
                optional(ExpectedExchangeResult) dy_result_opt;

                if (tokenIndex.exists(outcoming) && spent_token_root != outcoming) {
                    dy_result_opt = _get_dy(tokenIndex[spent_token_root], tokenIndex[outcoming], spent_amount);
                }

                if (
                    !dy_result_opt.hasValue() ||
                    dy_result_opt.get().amount < expected_amount
                ) {
                    need_cancel = true;
                } else {
                    uint8 i = tokenIndex[spent_token_root];
                    uint8 j = tokenIndex[outcoming];

                    ExpectedExchangeResult dy_result = dy_result_opt.get();
                    operation = TokenOperation(dy_result.amount, tokenData[j].root);

                    tokenData[i].balance += spent_amount - dy_result.beneficiary_fee;
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

                    if (dy_result.beneficiary_fee > 0) {
                        tokenData[i].accumulatedFee += dy_result.beneficiary_fee;
                        _processBeneficiaryFees(false, original_gas_to);
                    }
                }
            }

            if (!need_cancel) {

                if (outcoming != lp_root) { // withdraw or exchange

                    uint256 denominator = 0;
                    bool is_steps_array_valid = true;
                    for (NextExchangeData next_step: next_steps) {
                        if (next_step.poolRoot.value == 0 || next_step.poolRoot == address(this) ||
                            next_step.numerator == 0 || next_step.leaves == 0) {

                            is_steps_array_valid = false;
                        }
                        denominator += next_step.numerator;
                    }

                    if (is_steps_array_valid && next_steps.length > 0 && msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2) {
                        uint128 value = 0;
                        uint8 flag = MsgFlag.ALL_NOT_RESERVED;

                        for (NextExchangeData next_step: next_steps) {
                            uint128 next_pool_amount = uint128(math.muldiv(operation.amount, next_step.numerator, denominator));

                            if (next_steps.length > 1) {
                                value = next_step.nestedNodes * DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + next_step.leaves * DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2;
                                flag = MsgFlag.SENDER_PAYS_FEES;
                            }

                            IDexBasePool(next_step.poolRoot).crossPoolExchange{
                                value: value,
                                flag: flag
                            }(
                                id,

                                current_version,
                                DexPoolTypes.STABLESWAP,

                                _tokenRoots(),

                                op,
                                operation.root,
                                next_pool_amount,

                                sender_address,
                                recipient,

                                original_gas_to,
                                deploy_wallet_grams,

                                next_step.payload,
                                notify_success,
                                success_payload,
                                notify_cancel,
                                cancel_payload
                            );
                        }

                        if (next_steps.length > 1) {
                            original_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
                        }
                    } else {
                        uint8 j = tokenIndex[operation.root];

                        IDexVault(vault).transferV2{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            operation.amount,
                            tokenData[j].root,
                            tokenData[j].vaultWallet,
                            recipient,
                            deploy_wallet_grams,
                            true,
                            success_payload,
                            _tokenRoots(),
                            current_version,
                            original_gas_to
                        );
                    }
                }
            }
        }

        if (need_cancel) {
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

            IDexVault(vault).transferV2{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED
            }(
                spent_amount,
                spent_token_root,
                spent_token_root == lp_root ? lp_vault_wallet : tokenData[tokenIndex[spent_token_root]].vaultWallet,
                sender_address,
                deploy_wallet_grams,
                true,
                cancel_payload,
                _tokenRoots(),
                current_version,
                original_gas_to
            );
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Account operations

    function checkPair(address account_owner, uint32 /*account_version*/) override external onlyAccount(account_owner) {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        IDexAccount(msg.sender).checkPoolCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
            _tokenRoots(),
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

    modifier onlyVault() {
        require(msg.sender == vault, DexErrors.NOT_VAULT);
        _;
    }

    modifier onlyPairOrVault(address[] _roots) {
        require(msg.sender == _expectedPairAddress(_roots) || msg.sender == vault, DexErrors.NEITHER_PAIR_NOR_VAULT);
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
            emit PoolCodeUpgraded(new_version, new_type);

            TvmBuilder builder;

            builder.store(root);
            builder.store(vault);
            builder.store(current_version);
            builder.store(new_version);
            builder.store(send_gas_to);
            builder.store(DexPoolTypes.STABLESWAP);

            builder.store(platform_code);  // ref1 = platform_code

            //Tokens
            TvmCell tokens_data_cell = abi.encode(_tokenRoots());
            builder.store(tokens_data_cell);  // ref2

            TvmCell other_data = abi.encode(
                lp_root,
                lp_wallet,
                lp_vault_wallet,
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

        (root, vault, old_version, current_version, send_gas_to) = s.decode(address, address, uint32, uint32, address);

        platform_code = s.loadRef(); // ref 1
        TvmCell tokens_data_cell = s.loadRef(); // ref 2

        address[] roots = abi.decode(tokens_data_cell, address[]);
        N_COINS = uint8(roots.length);

        for (uint8 i = 0; i < N_COINS; i++) {
            tokenIndex[roots[i]] = i;
        }

        if (old_version == 0) {
            fee = FeeParams(1000000, 3000, 0, address(0), emptyMap);
            A = AmplificationCoefficient(100 * uint128(N_COINS) ** (N_COINS - 1), 1);

            tokenData = new PoolTokenData[](N_COINS);
            for (uint8 i = 0; i < N_COINS; i++) {
                tokenData[i] = PoolTokenData(roots[i], address(0), address(0), 0, 0, 0, 0, 0, false, false);
            }

            IDexVault(vault).addLiquidityTokenV2{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                address(this),
                roots,
                send_gas_to
            );
        } else {
            TvmCell otherData = s.loadRef(); // ref 3

            (
                lp_root, lp_wallet, lp_vault_wallet, lp_supply,
                fee,
                tokenData,
                A, PRECISION
            ) = abi.decode(otherData, (
                    address, address, address, uint128,
                    FeeParams,
                    PoolTokenData[],
                    AmplificationCoefficient,
                    uint256
                ));

            bool allTokensIsInit = true;
            for (uint8 i = 0; i < N_COINS; i++) {
                if (!tokenData[i].initialized) {
                    allTokensIsInit = false;
                    break;
                }
            }
            active = lp_wallet.value != 0 && lp_vault_wallet.value != 0 && allTokensIsInit;
        }

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
    }

    function _configureToken(address token_root) private view {
        ITokenRoot(token_root).deployWallet {
            value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: DexStablePool.onTokenWallet
        }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        ITokenRoot(token_root).walletOf{
            value: DexGas.SEND_EXPECTED_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: DexStablePool.onVaultTokenWallet
        }(vault);

        if (token_root != lp_root) {
            ITokenRoot(token_root).decimals{
                value: DexGas.GET_TOKEN_DECIMALS_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexStablePool.onTokenDecimals
            }();
        }
    }

    function onTokenWallet(address wallet) external {
        require(tokenIndex.exists(msg.sender) || msg.sender == lp_root, DexErrors.NOT_ROOT);

        if (msg.sender == lp_root && lp_wallet.value == 0) {
            lp_wallet = wallet;
        } else {
            tokenData[tokenIndex[msg.sender]].wallet = wallet;
        }

        bool allTokensIsInit = true;
        for (uint i = 0; i < N_COINS; i++) {
            if (!tokenData[i].initialized) {
                allTokensIsInit = false;
                break;
            }
        }
        active = allTokensIsInit;
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

        active = lp_wallet.value != 0 && lp_vault_wallet.value != 0;
    }

    function onVaultTokenWallet(address wallet) external {
        require(tokenIndex.exists(msg.sender) || msg.sender == lp_root, DexErrors.NOT_ROOT);

        if (msg.sender == lp_root && lp_vault_wallet.value == 0) {
            lp_vault_wallet = wallet;
        } else {
            tokenData[tokenIndex[msg.sender]].vaultWallet = wallet;
        }
    }

    function liquidityTokenRootDeployed(address lp_root_, address send_gas_to) override external onlyVault {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        lp_root = lp_root_;

        _configureToken(lp_root);

        address[] r = new address[](0);
        for (PoolTokenData t: tokenData) {
            _configureToken(t.root);
            r.push(t.root);
        }

        IDexRoot(root).onPoolCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(r, DexPoolTypes.STABLESWAP, send_gas_to);
    }

    function liquidityTokenRootNotDeployed(address /*lp_root_*/, address send_gas_to) override external onlyVault {
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
        address receive_token_root,
        uint128 price_amount
    ) external view returns (optional(uint256)) {
        optional(uint256) result;

        if (tokenIndex.exists(spent_token_root) && tokenIndex.exists(receive_token_root) && price_amount != 0 && amount != 0) {

            uint8 i = tokenIndex[spent_token_root];
            uint8 j = tokenIndex[receive_token_root];

            uint128[] reserves_mem = _reserves();
            uint256[] xp_mem = _xp_mem(reserves_mem);

            optional(ExpectedExchangeResult) old_price_res = _get_dy_mem(i, j, price_amount, xp_mem);

            optional(ExpectedExchangeResult) dy_result_opt = _get_dy_mem(i, j, amount, xp_mem);

            if (
                dy_result_opt.hasValue() &&
                old_price_res.hasValue()
            ) {
                uint128 old_price = old_price_res.get().amount;
                ExpectedExchangeResult dy_result = dy_result_opt.get();

                reserves_mem[i] += amount - dy_result.beneficiary_fee;
                reserves_mem[j] -= dy_result.amount;

                optional(ExpectedExchangeResult) new_price_res = _get_dy_mem(i, j, price_amount, _xp_mem(reserves_mem));

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

    function _get_dy(uint8 i, uint8 j, uint128 _dx) internal view returns (optional(ExpectedExchangeResult)) {
        uint256[] xp = new uint256[](0);

        for (PoolTokenData t: tokenData) {
            xp.push(math.muldiv(t.rate, t.balance, PRECISION));
        }

        return _get_dy_mem(i, j, _dx, xp);
    }

    function _get_dy_mem(uint8 i, uint8 j, uint128 _dx, uint256[] xp) internal view returns (optional(ExpectedExchangeResult)) {
        optional(ExpectedExchangeResult) result;

        uint128 x_fee = math.muldivc(_dx, fee.pool_numerator + fee.beneficiary_numerator, fee.denominator);
        uint128 x_beneficiary_fee = math.muldiv(x_fee, fee.beneficiary_numerator, fee.pool_numerator + fee.beneficiary_numerator);
        uint128 x_pool_fee = x_fee - x_beneficiary_fee;

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

        return result;
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
            uint128 fee_d_minus_n = uint128(fee.denominator - fee.pool_numerator - fee.beneficiary_numerator);
            uint128 dx_raw = uint128(math.muldivc(x_opt.get() - xp[i], PRECISION, tokenData[i].rate));
            uint128 dx = math.muldivc(dx_raw, fee.denominator, fee_d_minus_n);

            uint128 x_fee = math.muldivc(dx, fee.pool_numerator + fee.beneficiary_numerator, fee.denominator);

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

    function _expectedDepositLiquidity(uint128[] _amounts) private view returns(optional(DepositLiquidityResultV2)) {
        optional(DepositLiquidityResultV2) result;

        uint128[] old_balances = _reserves();

        optional(uint256) D0_opt = _get_D(_xp_mem(old_balances));

        uint128[] new_balances = old_balances;
        uint128[] pool_fees = new uint128[](N_COINS);
        uint128[] beneficiary_fees = new uint128[](N_COINS);
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
            sell[i] = false;
        }

        optional(uint256) D1_opt = _get_D(_xp_mem(new_balances));

        //  # dev: initial deposit requires all coins
        if (lp_supply == 0 && hasZeroBalance || !D0_opt.hasValue() || !D1_opt.hasValue()) {
            return result;
        }

        uint256 D0 = D0_opt.get();
        uint256 D1 = D1_opt.get();

        if (D0 >= D1) {
            return result;
        }

        optional(uint256) D2_opt;

        if (lp_supply > 0) {
            uint128 fee_numerator = math.muldiv(fee.pool_numerator + fee.beneficiary_numerator, N_COINS, (4 * (N_COINS - 1)));

            for (uint8 i = 0; i < N_COINS; i++) {
                uint128 ideal_balance = uint128(math.muldiv(D1, old_balances[i], D0));
                uint128 new_balance = new_balances[i];
                uint128 difference = ideal_balance > new_balance ? ideal_balance - new_balance : new_balance - ideal_balance;
                sell[i] = ideal_balance < new_balance;
                uint128 fees = math.muldivc(fee_numerator, difference, fee.denominator);
                beneficiary_fees[i] = math.muldiv(fees, fee.beneficiary_numerator, fee.pool_numerator + fee.beneficiary_numerator);
                pool_fees[i] = fees - beneficiary_fees[i];
                result_balances[i] = new_balance - beneficiary_fees[i];
                new_balances[i] = new_balances[i] - pool_fees[i] - beneficiary_fees[i];
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
            return result;
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

        return result;

    }

    function _applyAddLiquidity(
        DepositLiquidityResultV2 r,
        uint64 call_id,
        bool via_account,
        address sender_address,
        address recipient
    ) private {

        TokenOperation[] spent_tokens;
        TokenOperation[] receive_tokens;
        ExchangeFee[] fees;
        TokenOperation[] amounts;

        for (uint8 i = 0; i < N_COINS; i++) {
            amounts.push(TokenOperation(r.amounts[i], tokenData[i].root));
            if (r.differences[i] > 0) {
                fees.push(ExchangeFee(tokenData[i].root, r.pool_fees[i], r.beneficiary_fees[i], fee.beneficiary));
                if (r.sell[i]) {
                    spent_tokens.push(TokenOperation(r.differences[i], tokenData[i].root));
                } else {
                    receive_tokens.push(TokenOperation(r.differences[i], tokenData[i].root));
                }
            }

            tokenData[i].balance = r.result_balances[i];
            tokenData[i].accumulatedFee += r.beneficiary_fees[i];
        }

        lp_supply += r.lp_reward;

        emit DepositLiquidityV2(sender_address, recipient, amounts, fees, spent_tokens, receive_tokens, r.lp_reward);

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

    function _get_y_D(AmplificationCoefficient A_, uint8 i, uint256[] _xp, uint256 D) internal view returns(optional(uint128)) {
        optional(uint128) result;
        if (i >= N_COINS) {
            return result;
        }

        uint256 Ann = A_.value * N_COINS;
        uint256 c = D;
        uint256 S = 0;
        uint256 _x = 0;

        for (uint8 _i = 0; _i < N_COINS; _i++) {
            if (_i == i) {
                continue;
            }
            _x = _xp[_i];
            S += _x;
            c = math.muldiv(c, D, _x * N_COINS);
        }

        c = math.muldiv(c, D * A_.precision, (Ann * N_COINS));
        uint256 b = S + math.muldiv(D, A_.precision, Ann);
        uint256 y_prev = 0;
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

    function _expectedWithdrawLiquidity(uint128 token_amount) internal view returns(optional(WithdrawResultV2)) {
        optional(WithdrawResultV2) result;

        if (lp_supply == 0) {
            return result;
        }

        uint128[] pool_fees = new uint128[](N_COINS);
        uint128[] beneficiary_fees = new uint128[](N_COINS);
        uint128[] differences = new uint128[](N_COINS);
        bool[] sell = new bool[](N_COINS);

        uint128[] old_balances = _reserves();

        uint128[] withdraw_amounts = new uint128[](0);
        uint128[] result_balances = new uint128[](0);

        for (uint8 i = 0; i < N_COINS; i++) {
            uint128 amount = math.muldiv(old_balances[i], token_amount, lp_supply);
            withdraw_amounts.push(amount);
            result_balances.push(old_balances[i] - amount);
        }

        result.set(WithdrawResultV2(
            token_amount,
            old_balances,
            withdraw_amounts,
            result_balances,
            uint128(_get_D(_xp_mem(result_balances)).get()),
            differences,
            sell,
            pool_fees,
            beneficiary_fees
        ));

        return result;
    }

    function _expectedWithdrawLiquidityOneCoin(uint128 token_amount, uint8 i) internal view returns(optional(WithdrawResultV2)) {
        AmplificationCoefficient amp = A;
        uint128 fee_numerator = math.muldiv(fee.pool_numerator + fee.beneficiary_numerator, N_COINS, (4 * (N_COINS - 1)));

        optional(WithdrawResultV2) result;

        uint128[] pool_fees = new uint128[](N_COINS);
        uint128[] beneficiary_fees = new uint128[](N_COINS);
        uint128[] differences = new uint128[](N_COINS);
        bool[] sell = new bool[](N_COINS);
        uint128[] amounts = new uint128[](N_COINS);

        uint128[] old_balances = _reserves();
        uint256[] xp_mem = _xp_mem(old_balances);

        uint128[] result_balances = old_balances;

        optional(uint256) D0_opt = _get_D(xp_mem);
        uint256 D0 = D0_opt.get();

        optional(uint256) D1_opt = D0 - math.muldiv(token_amount, D0, lp_supply);
        uint256 D1 = D1_opt.get();

        uint256[] xp_reduced = xp_mem;

        optional(uint128) new_y_opt = _get_y_D(amp, i, xp_mem, D1);

        uint256 dy_0 = 0;
        uint256 dy = 0;
        if (!new_y_opt.hasValue()) {
            return result;
        }

        uint128 new_y = new_y_opt.get();
        dy_0 = (xp_mem[i] - new_y) / tokenData[i].precisionMul; // w/o fees

        for (uint8 j = 0; j < N_COINS; j++) {
            uint256 dx_expected = 0;
            if (j == i) {
                sell[j] = false;
                dx_expected = math.muldiv(xp_mem[j], D1, D0) - new_y;
            } else {
                sell[j] = true;
                dx_expected = xp_mem[j] - math.muldiv(xp_mem[j], D1, D0);
            }
            differences[j] = uint128(dx_expected);
            xp_reduced[j] -= math.muldiv(fee_numerator, dx_expected, fee.denominator);
        }

        optional(uint128) new_y_reduced_opt = _get_y_D(amp, i, xp_reduced, D1);
        dy = xp_reduced[i] - new_y_reduced_opt.get();
        dy = (dy - 1) / tokenData[i].precisionMul;  // Withdraw less to account for rounding errors

        amounts[i] = uint128(dy);
        result_balances[i] = uint128(old_balances[i] - dy);

        result.set(WithdrawResultV2(
            token_amount,
            old_balances,
            amounts,
            result_balances,
            uint128(D1),
            differences,
            sell,
            pool_fees,
            beneficiary_fees
        ));

        return result;
    }

    function _applyWithdrawLiquidity(
        WithdrawResultV2 r,
        uint64 call_id,
        bool via_account,
        address sender_address,
        address recipient
    ) private {

        TokenOperation[] spent_tokens;
        TokenOperation[] receive_tokens;
        ExchangeFee[] fees;
        TokenOperation[] amounts;

        for (uint8 i = 0; i < N_COINS; i++) {
            amounts.push(TokenOperation(r.amounts[i], tokenData[i].root));
            if (r.differences[i] > 0) {
                fees.push(ExchangeFee(tokenData[i].root, r.pool_fees[i], r.beneficiary_fees[i], fee.beneficiary));
                if (r.sell[i]) {
                    spent_tokens.push(TokenOperation(r.differences[i], tokenData[i].root));
                } else {
                    receive_tokens.push(TokenOperation(r.differences[i], tokenData[i].root));
                }
            }

            tokenData[i].balance = r.result_balances[i];
            tokenData[i].accumulatedFee += r.beneficiary_fees[i];
        }

        lp_supply -= r.lp_amount;

        emit WithdrawLiquidityV2(sender_address, recipient, r.lp_amount, amounts, fees, spent_tokens, receive_tokens);

        IDexPairOperationCallback(sender_address).dexPairWithdrawSuccessV2{
            value: DexGas.OPERATION_CALLBACK_BASE + 2,
            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
            bounce: false
        }(call_id, via_account, r);

        if (sender_address != recipient) {
            IDexPairOperationCallback(recipient).dexPairWithdrawSuccessV2{
                value: DexGas.OPERATION_CALLBACK_BASE,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, via_account, r);
        }
    }
}
