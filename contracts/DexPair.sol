pragma ton-solidity >= 0.57.0;

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

import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexPair.sol";
import "./interfaces/IDexConstantProductPair.sol";
import "./interfaces/ISuccessCallback.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IDexVault.sol";
import "./structures/IExchangeResult.sol";
import "./structures/IWithdrawResult.sol";
import "./structures/ITokenOperationStructure.sol";
import "./interfaces/IDexPairOperationCallback.sol";
import "./structures/IAmplificationCoefficient.sol";

import "./structures/IPoolTokenData.sol";
import "./DexPlatform.sol";
import "./abstract/DexContractBase.sol";

contract DexPair is DexContractBase, IDexConstantProductPair {

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Data

    // Base:
    address root;
    address vault;

    // Custom:
    bool active;
    uint32 current_version;

    // Params:
    address left_root;
    address right_root;

    // Wallets
    address lp_wallet;
    address left_wallet;
    address right_wallet;
    // Vault wallets
    address vault_left_wallet;
    address vault_right_wallet;
    // Liquidity tokens
    address lp_root;
    uint128 lp_supply;
    // Balances
    uint128 left_balance;
    uint128 right_balance;
    // Fee
    FeeParams fee;
    uint128 accumulated_left_fee;
    uint128 accumulated_right_fee;

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
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_root, right_root, lp_root);
    }

    function getTokenWallets() override external view responsible returns (address left, address right, address lp) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_wallet, right_wallet, lp_wallet);
    }

    function getVersion() override external view responsible returns (uint32 version) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } current_version;
    }

    function getPoolType() override external view responsible returns (uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPoolTypes.CONSTANT_PRODUCT;
    }

    function getVault() override external view responsible returns (address dex_vault) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } vault;
    }

    function getVaultWallets() override external view responsible returns (address left, address right) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (vault_left_wallet, vault_right_wallet);
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

    function getFeeParams() override external view responsible returns (FeeParams) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } fee;
    }

    function getAccumulatedFees() override external view responsible returns (uint128[] accumulatedFees) {
        uint128[] _accumulatedFees = new uint128[](2);

        _accumulatedFees[0] = accumulated_left_fee;
        _accumulatedFees[1] = accumulated_right_fee;

        return {
            value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS
        } _accumulatedFees;
    }

    function withdrawBeneficiaryFee(address send_gas_to) external {
        require(fee.beneficiary.value != 0 && msg.sender == fee.beneficiary, DexErrors.NOT_BENEFICIARY);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        _processBeneficiaryFees(true, send_gas_to);
        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
    }

    function isActive() override external view responsible returns (bool) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } active;
    }

    function getBalances() override external view responsible returns (IDexPairBalances) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } IDexPairBalances(
            lp_supply,
            left_balance,
            right_balance
        );
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Direct operations

    function buildExchangePayload(uint64 id, uint128 deploy_wallet_grams, uint128 expected_amount) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        builder.store(expected_amount);
        return builder.toCell();
    }

    function buildDepositLiquidityPayload(uint64 id, uint128 deploy_wallet_grams) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        return builder.toCell();
    }

    function buildWithdrawLiquidityPayload(uint64 id, uint128 deploy_wallet_grams) external pure returns (TvmCell) {
        TvmBuilder builder;
        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        return builder.toCell();
    }

    function buildCrossPairExchangePayload(
        uint64 id,
        uint128 deploy_wallet_grams,
        uint128 expected_amount,
        TokenOperation[] steps
    ) external pure returns (TvmCell) {
        require(steps.length > 0);
        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        builder.store(id);
        builder.store(deploy_wallet_grams);
        builder.store(expected_amount);
        builder.store(steps[0].root);

        TvmBuilder next_step_builder;
        next_step_builder.store(steps[steps.length - 1].amount);

        for (uint i = steps.length - 1; i > 0; i--) {
            TvmBuilder current_step_builder;
            current_step_builder.store(steps[i - 1].amount, steps[i].root);
            current_step_builder.store(next_step_builder.toCell());
            next_step_builder = current_step_builder;
        }

        builder.store(next_step_builder.toCell());

        return builder.toCell();
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
        TvmSlice payloadSlice = payload.toSlice();

        bool need_cancel = !active ||
            payloadSlice.bits() < 200 ||
            lp_supply == 0;

        bool notify_success = payloadSlice.refs() >= 1;
        bool notify_cancel = payloadSlice.refs() >= 2;
        bool hasRef3 = payloadSlice.refs() >= 3;
        TvmCell empty;
        TvmCell success_payload;
        TvmCell cancel_payload;
        TvmCell ref3;
        if (notify_success) {
            success_payload = payloadSlice.loadRef();
        }
        if (notify_cancel) {
            cancel_payload = payloadSlice.loadRef();
        }
        if (hasRef3) {
            ref3 = payloadSlice.loadRef();
        }

        if (!need_cancel) {

            (uint8 op, uint64 id, uint128 deploy_wallet_grams) = payloadSlice.decode(uint8, uint64, uint128);

            if (token_root == left_root && msg.sender == left_wallet &&
                msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deploy_wallet_grams) {
                if (op == DexOperationTypes.EXCHANGE && payloadSlice.bits() >= 128) {
                    // exchange left to right
                    uint128 expected_amount = payloadSlice.decode(uint128);
                    (uint128 right_amount, uint128 left_pool_fee, uint128 left_beneficiary_fee) =
                        _expectedExchange(tokens_amount, left_balance, right_balance);
                    if (
                        right_amount <= right_balance &&
                        right_amount >= expected_amount &&
                        right_amount > 0 &&
                        (left_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (left_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
                    ) {
                        left_balance += tokens_amount - left_beneficiary_fee;
                        right_balance -= right_amount;

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(left_root, left_pool_fee, left_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            left_root,
                            tokens_amount,
                            right_root,
                            right_amount,
                            fees
                        );

                        if (left_beneficiary_fee > 0) {
                            accumulated_left_fee += left_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 10,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(true, tokens_amount, left_pool_fee + left_beneficiary_fee, right_amount));

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

                        IDexVault(vault).transfer{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            right_amount,
                            right_root,
                            vault_right_wallet,
                            sender_address,
                            deploy_wallet_grams,
                            notify_success,
                            success_payload,
                            left_root,
                            right_root,
                            current_version,
                            original_gas_to
                        );
                    } else {
                        need_cancel = true;
                    }
                } else if (op == DexOperationTypes.DEPOSIT_LIQUIDITY) {
                    // deposit liquidity by left side with auto exchange
                    (DepositLiquidityResult r, uint128 step_2_pool_fee, uint128 step_2_beneficiary_fee) =
                        _expectedDepositLiquidity(tokens_amount, 0, true);
                    if (
                        r.step_3_lp_reward > 0 &&
                        r.step_2_received <= right_balance &&
                        r.step_2_received > 0 &&
                        (step_2_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (step_2_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
                    )
                    {
                        lp_supply = lp_supply + r.step_3_lp_reward;
                        left_balance += tokens_amount - step_2_beneficiary_fee;

                        if (step_2_beneficiary_fee > 0) {
                            accumulated_left_fee += step_2_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(left_root, step_2_pool_fee, step_2_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            left_root,
                            r.step_2_spent,
                            right_root,
                            r.step_2_received,
                            fees
                        );

                        TokenOperation[] operations = new TokenOperation[](0);
                        operations.push(TokenOperation(r.step_3_left_deposit, left_root));
                        operations.push(TokenOperation(r.step_3_right_deposit, right_root));
                        emit DepositLiquidity(sender_address, sender_address, operations, r.step_3_lp_reward);

                        IDexPairOperationCallback(sender_address).dexPairDepositLiquiditySuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 20,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, r);

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
                            r.step_3_lp_reward,
                            sender_address,
                            deploy_wallet_grams,
                            original_gas_to,
                            notify_success,
                            success_payload
                        );
                    } else {
                        need_cancel = true;
                    }
                } else if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE &&
                           payloadSlice.bits() >= 395 &&
                           notify_success &&
                           success_payload.toSlice().bits() >= 128) {
                    (uint128 expected_amount, address next_token_root) = payloadSlice.decode(uint128, address);
                    (uint128 right_amount, uint128 left_pool_fee, uint128 left_beneficiary_fee) =
                        _expectedExchange(tokens_amount, left_balance, right_balance);
                    if (
                        right_amount <= right_balance &&
                        right_amount >= expected_amount &&
                        right_amount > 0 &&
                        (left_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (left_beneficiary_fee > 0 || fee.beneficiary_numerator == 0) &&
                        next_token_root.value != 0 &&
                        next_token_root != right_root &&
                        next_token_root != left_root
                    ) {

                        left_balance += tokens_amount - left_beneficiary_fee;
                        right_balance -= right_amount;

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(left_root, left_pool_fee, left_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            left_root,
                            tokens_amount,
                            right_root,
                            right_amount,
                            fees
                        );

                        if (left_beneficiary_fee > 0) {
                            accumulated_left_fee += left_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 40,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(true, tokens_amount, left_pool_fee + left_beneficiary_fee, right_amount));

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

                        address next_pair = _expectedPairAddress(right_root, next_token_root);

                        IDexPair(next_pair).crossPoolExchange{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            id,

                            current_version,
                            DexPoolTypes.CONSTANT_PRODUCT,

                            _tokenRoots(),

                            right_root,
                            right_amount,

                            sender_address,

                            original_gas_to,
                            deploy_wallet_grams,

                            success_payload,    // actually it is next_payload
                            notify_cancel,      // actually it is notify_success
                            cancel_payload,     // actually it is success_payload
                            hasRef3,            // actually it is notify_success
                            ref3                // actually it is cancel_payload
                        );
                    } else {
                        need_cancel = true;
                    }
                } else {
                    need_cancel = true;
                }
            } else if (token_root == right_root && msg.sender == right_wallet &&
                        msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + deploy_wallet_grams) {
                if (op == DexOperationTypes.EXCHANGE && payloadSlice.bits() >= 128) {
                    // exchange right to left
                    uint128 expected_amount = payloadSlice.decode(uint128);
                    (uint128 left_amount, uint128 right_pool_fee, uint128 right_beneficiary_fee) =
                        _expectedExchange(tokens_amount, right_balance, left_balance);
                    if (
                        left_amount <= left_balance &&
                        left_amount >= expected_amount &&
                        left_amount > 0 &&
                        (right_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (right_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
                    ) {
                        right_balance += tokens_amount - right_beneficiary_fee;
                        left_balance -= left_amount;

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(right_root, right_pool_fee, right_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            right_root,
                            tokens_amount,
                            left_root,
                            left_amount,
                            fees
                        );

                        if (right_beneficiary_fee > 0) {
                            accumulated_right_fee += right_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 10,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(false, tokens_amount, right_pool_fee + right_beneficiary_fee, left_amount));

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

                        IDexVault(vault).transfer{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            left_amount,
                            left_root,
                            vault_left_wallet,
                            sender_address,
                            deploy_wallet_grams,
                            notify_success,
                            success_payload,
                            left_root,
                            right_root,
                            current_version,
                            original_gas_to
                        );
                    } else {
                        need_cancel = true;
                    }
                } else if (op == DexOperationTypes.DEPOSIT_LIQUIDITY) {
                    // deposit liquidity by right side with auto exchange
                    (DepositLiquidityResult r, uint128 step_2_pool_fee, uint128 step_2_beneficiary_fee) =
                        _expectedDepositLiquidity(0, tokens_amount, true);
                    if (
                        r.step_3_lp_reward > 0 &&
                        r.step_2_received <= left_balance &&
                        r.step_2_received > 0 &&
                        (step_2_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (step_2_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
                    )
                    {
                        lp_supply = lp_supply + r.step_3_lp_reward;
                        right_balance += tokens_amount - step_2_beneficiary_fee;

                        if (step_2_beneficiary_fee > 0) {
                            accumulated_right_fee += step_2_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(right_root, step_2_pool_fee, step_2_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            right_root,
                            r.step_2_spent,
                            left_root,
                            r.step_2_received,
                            fees
                        );

                        TokenOperation[] operations = new TokenOperation[](0);
                        operations.push(TokenOperation(r.step_3_left_deposit, left_root));
                        operations.push(TokenOperation(r.step_3_right_deposit, right_root));
                        emit DepositLiquidity(sender_address, sender_address, operations, r.step_3_lp_reward);

                        IDexPairOperationCallback(sender_address).dexPairDepositLiquiditySuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 20,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, r);

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
                            r.step_3_lp_reward,
                            sender_address,
                            deploy_wallet_grams,
                            original_gas_to,
                            notify_success,
                            success_payload
                        );
                    } else {
                        need_cancel = true;
                    }
                } else if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE &&
                           payloadSlice.bits() >= 395 &&
                           notify_success &&
                           success_payload.toSlice().bits() >= 128) {
                    (uint128 expected_amount, address next_token_root) = payloadSlice.decode(uint128, address);
                    (uint128 left_amount, uint128 right_pool_fee, uint128 right_beneficiary_fee) =
                        _expectedExchange(tokens_amount, right_balance, left_balance);
                    if (
                        left_amount <= left_balance &&
                        left_amount >= expected_amount &&
                        left_amount > 0 &&
                        (right_pool_fee > 0 || fee.pool_numerator == 0) &&
                        (right_beneficiary_fee > 0 || fee.beneficiary_numerator == 0) &&
                        next_token_root.value != 0 &&
                        next_token_root != right_root &&
                        next_token_root != left_root
                    ) {

                        right_balance += tokens_amount - right_beneficiary_fee;
                        left_balance -= left_amount;

                        ExchangeFee[] fees;
                        fees.push(ExchangeFee(right_root, right_pool_fee, right_beneficiary_fee, fee.beneficiary));

                        emit Exchange(
                            sender_address,
                            sender_address,
                            right_root,
                            tokens_amount,
                            left_root,
                            left_amount,
                            fees
                        );

                        if (right_beneficiary_fee > 0) {
                            accumulated_right_fee += right_beneficiary_fee;
                            _processBeneficiaryFees(false, original_gas_to);
                        }

                        IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                            value: DexGas.OPERATION_CALLBACK_BASE + 40,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id, false, IExchangeResult.ExchangeResult(false, tokens_amount, right_pool_fee + right_beneficiary_fee, left_amount));

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

                        address next_pair = _expectedPairAddress(left_root, next_token_root);

                        IDexPair(next_pair).crossPoolExchange{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED
                        }(
                            id,

                            current_version,
                            DexPoolTypes.CONSTANT_PRODUCT,

                            _tokenRoots(),

                            left_root,
                            left_amount,

                            sender_address,

                            original_gas_to,
                            deploy_wallet_grams,

                            success_payload,    // actually it is next_payload
                            notify_cancel,      // actually it is notify_success
                            cancel_payload,     // actually it is success_payload
                            hasRef3,            // actually it is notify_success
                            ref3                // actually it is cancel_payload
                        );
                    } else {
                        need_cancel = true;
                    }
                } else {
                    need_cancel = true;
                }
            } else if (op == DexOperationTypes.WITHDRAW_LIQUIDITY &&
                       token_root == lp_root &&
                       msg.sender == lp_wallet &&
                       msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2 + 2 * deploy_wallet_grams) {

                TokenOperation[] operations = _withdrawLiquidityBase(tokens_amount, sender_address);

                IDexPairOperationCallback(sender_address).dexPairWithdrawSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 30,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id, false, IWithdrawResult.WithdrawResult(tokens_amount, operations[0].amount, operations[1].amount));

                if(operations[0].amount > 0) {
                    IDexVault(vault).transfer{
                        value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deploy_wallet_grams,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        operations[0].amount,
                        left_root,
                        vault_left_wallet,
                        sender_address,
                        deploy_wallet_grams,
                        notify_success,
                        success_payload,
                        left_root,
                        right_root,
                        current_version,
                        original_gas_to
                    );
                }

                if(operations[1].amount > 0) {
                    IDexVault(vault).transfer{
                        value: DexGas.VAULT_TRANSFER_BASE_VALUE_V2 + deploy_wallet_grams,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        operations[1].amount,
                        right_root,
                        vault_right_wallet,
                        sender_address,
                        deploy_wallet_grams,
                        notify_success,
                        success_payload,
                        left_root,
                        right_root,
                        current_version,
                        original_gas_to
                    );
                }

                IBurnableTokenWallet(msg.sender).burn{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                    tokens_amount,
                    original_gas_to,
                    address.makeAddrStd(0, 0),
                    empty
                );
            } else {
                need_cancel = true;
            }
        }

        if (need_cancel) {
            uint64 id = 0;

            if (payload.toSlice().bits() >= 72) {
                (,id) = payload.toSlice().decode(uint8, uint64);
            }

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
                cancel_payload
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
        if (lp_supply == 0) {
            return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DepositLiquidityResult(
                left_amount,
                right_amount,
                math.max(left_amount, right_amount),
                false, false, 0, 0, 0, 0, 0, 0
            );
        } else {
            (DepositLiquidityResult r,,) = _expectedDepositLiquidity(left_amount, right_amount, auto_change);
            return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } r;
        }
    }

    function depositLiquidity(
        uint64 call_id,
        uint128 left_amount,
        uint128 right_amount,
        address expected_lp_root,
        bool    auto_change,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        require(expected_lp_root == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        require(lp_supply != 0 || (left_amount > 0 && right_amount > 0), DexErrors.WRONG_LIQUIDITY);
        require((left_amount > 0 && right_amount > 0) || (auto_change && (left_amount + right_amount > 0)),
            DexErrors.AMOUNT_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        uint128 lp_tokens_amount;

        if (lp_supply == 0) {
            lp_tokens_amount = math.max(left_amount, right_amount);
            left_balance = left_amount;
            right_balance = right_amount;

            TokenOperation[] operations = new TokenOperation[](0);
            operations.push(TokenOperation(left_amount, left_root));
            operations.push(TokenOperation(right_amount, right_root));
            emit DepositLiquidity(account_owner, account_owner, operations, lp_tokens_amount);

            IDexPairOperationCallback(account_owner).dexPairDepositLiquiditySuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 2,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, true, DepositLiquidityResult(left_amount, right_amount, lp_tokens_amount, false, false, 0, 0, 0, 0, 0, 0));
        } else {
            (DepositLiquidityResult r, uint128 step_2_pool_fee, uint128 step_2_beneficiary_fee) =
                _expectedDepositLiquidity(left_amount, right_amount, auto_change);
            lp_tokens_amount = r.step_1_lp_reward + r.step_3_lp_reward;

            if (auto_change) {
                if (r.step_2_right_to_left) {
                    require(
                        r.step_2_received <= left_balance + r.step_1_left_deposit,
                        DexErrors.NOT_ENOUGH_FUNDS
                    );

                    left_balance += left_amount;
                    right_balance += right_amount - step_2_beneficiary_fee;

                    accumulated_right_fee += step_2_beneficiary_fee;
                } else if (r.step_2_left_to_right) {
                    require(
                        r.step_2_received <= right_balance + r.step_1_right_deposit,
                        DexErrors.NOT_ENOUGH_FUNDS
                    );

                    left_balance += left_amount - step_2_beneficiary_fee;
                    right_balance += right_amount;

                    accumulated_left_fee += step_2_beneficiary_fee;
                }

                if (step_2_beneficiary_fee > 0) {
                    _processBeneficiaryFees(false, send_gas_to);
                }
            } else {
                left_balance = left_balance + r.step_1_left_deposit;
                right_balance = right_balance + r.step_1_right_deposit;

                if (r.step_1_left_deposit < left_amount) {
                    IDexAccount(msg.sender).internalPairTransfer{
                        value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        left_amount - r.step_1_left_deposit,
                        left_root,
                        left_root,
                        right_root,
                        send_gas_to
                    );
                }

                if (r.step_1_right_deposit < right_amount) {
                    IDexAccount(msg.sender).internalPairTransfer{
                        value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                        flag: MsgFlag.SENDER_PAYS_FEES
                    }(
                        right_amount - r.step_1_right_deposit,
                        right_root,
                        left_root,
                        right_root,
                        send_gas_to
                    );
                }
            }

            if (r.step_1_lp_reward > 0) {
                TokenOperation[] step_1_operations;
                step_1_operations.push(TokenOperation(r.step_1_left_deposit, left_root));
                step_1_operations.push(TokenOperation(r.step_1_right_deposit, right_root));
                emit DepositLiquidity(account_owner, account_owner, step_1_operations, r.step_1_lp_reward);
            }

            ExchangeFee[] fees;
            if (r.step_2_right_to_left) {
                fees.push(ExchangeFee(right_root, step_2_pool_fee, step_2_beneficiary_fee, fee.beneficiary));
                emit Exchange(
                    account_owner,
                    account_owner,
                    right_root,
                    r.step_2_spent,
                    left_root,
                    r.step_2_received,
                    fees
                );
            } else if (r.step_2_left_to_right) {
                fees.push(ExchangeFee(left_root, step_2_pool_fee, step_2_beneficiary_fee, fee.beneficiary));
                emit Exchange(
                    account_owner,
                    account_owner,
                    left_root,
                    r.step_2_spent,
                    right_root,
                    r.step_2_received,
                    fees
                );
            }

            if (r.step_3_lp_reward > 0) {
                TokenOperation[] step_3_operations;
                step_3_operations.push(TokenOperation(r.step_3_left_deposit, left_root));
                step_3_operations.push(TokenOperation(r.step_3_right_deposit, right_root));
                emit DepositLiquidity(account_owner, account_owner, step_3_operations, r.step_3_lp_reward);
            }

            IDexPairOperationCallback(account_owner).dexPairDepositLiquiditySuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 2,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, true, r);

        }

        lp_supply = lp_supply + lp_tokens_amount;

        TvmCell empty;
        ITokenRoot(lp_root).mint{
            value: DexGas.DEPLOY_MINT_VALUE_BASE + DexGas.DEPLOY_EMPTY_WALLET_GRAMS,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(
            lp_tokens_amount,
            account_owner,
            DexGas.DEPLOY_EMPTY_WALLET_GRAMS,
            send_gas_to,
            send_gas_to == account_owner,
            empty
        );

        _sync();

        ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);
    }

    function _expectedDepositLiquidity(
        uint128 left_amount,
        uint128 right_amount,
        bool auto_change
    ) private view returns (DepositLiquidityResult, uint128, uint128) {
        // step 1 (first deposit)
        uint128 step_1_left_deposit = 0;
        uint128 step_1_right_deposit = 0;
        uint128 step_1_lp_reward = 0;

        if (left_amount > 0 && right_amount > 0) {
            step_1_left_deposit = math.min(left_amount, math.muldiv(left_balance, right_amount, right_balance));
            step_1_right_deposit = math.min(right_amount, math.muldiv(right_balance, left_amount, left_balance));
            step_1_lp_reward = math.max(
                math.muldiv(step_1_right_deposit, lp_supply, right_balance),
                math.muldiv(step_1_left_deposit, lp_supply, left_balance)
            );
        }

        uint128 current_left_amount = left_amount - step_1_left_deposit;
        uint128 current_right_amount = right_amount - step_1_right_deposit;
        uint128 current_left_balance = left_balance + step_1_left_deposit;
        uint128 current_right_balance = right_balance + step_1_right_deposit;
        uint128 current_lp_supply = lp_supply + step_1_lp_reward;

        bool step_2_left_to_right = false;
        bool step_2_right_to_left = false;
        uint128 step_2_spent = 0;
        uint128 step_2_pool_fee = 0;
        uint128 step_2_beneficiary_fee = 0;
        uint128 step_2_received = 0;

        uint128 step_3_left_deposit = 0;
        uint128 step_3_right_deposit = 0;
        uint128 step_3_lp_reward = 0;

        uint256 fee_d = uint256(fee.denominator);
        uint256 fee_d_minus_n = fee_d - uint256(fee.pool_numerator + fee.beneficiary_numerator);
        uint256 denominator = fee_d_minus_n * (fee_d - uint256(fee.beneficiary_numerator));

        if (auto_change && current_right_amount > 0) {
            // step 2 (surplus RIGHT exchange)
            step_2_right_to_left = true;
            uint256 p = math.muldiv(
                uint256(current_right_balance),
                fee_d * (fee_d_minus_n + fee_d),
                denominator
            );
            uint256 q = math.muldiv(
                uint256(current_right_balance),
                fee_d * fee_d * uint256(current_right_amount),
                denominator
            );
            step_2_spent = _solveQuadraticEquationPQ(p, q);
            (step_2_received, step_2_pool_fee, step_2_beneficiary_fee) =
                _expectedExchange(step_2_spent, current_right_balance, current_left_balance);

            current_right_amount = current_right_amount - step_2_spent;
            current_right_balance = current_right_balance + step_2_spent - step_2_beneficiary_fee;

            if (current_right_amount > 0 && step_2_received > 0) {
                // step 3 (deposit exchanged amounts)
                step_3_right_deposit = current_right_amount;
                step_3_left_deposit = step_2_received;

                step_3_lp_reward = math.muldiv(current_right_amount, current_lp_supply, current_right_balance);
            } else {
                step_2_right_to_left = false;
                step_1_right_deposit = right_amount;
            }
        } else if (auto_change && current_left_amount > 0) {
            // step 2 (surplus LEFT exchange)
            step_2_left_to_right = true;
            uint256 p = math.muldiv(
                uint256(current_left_balance),
                fee_d * (fee_d_minus_n + fee_d),
                denominator
            );
            uint256 q = math.muldiv(
                uint256(current_left_balance),
                fee_d * fee_d * uint256(current_left_amount),
                denominator
            );
            step_2_spent = _solveQuadraticEquationPQ(p, q);
            (step_2_received, step_2_pool_fee, step_2_beneficiary_fee) =
                _expectedExchange(step_2_spent, current_left_balance, current_right_balance);

            current_left_amount = current_left_amount - step_2_spent;
            current_left_balance = current_left_balance + step_2_spent - step_2_beneficiary_fee;

            if (current_left_amount > 0 && step_2_received > 0) {
                // step 3 (deposit exchanged amounts)
                step_3_left_deposit = current_left_amount;
                step_3_right_deposit = step_2_received;

                step_3_lp_reward = math.muldiv(current_left_amount, current_lp_supply, current_left_balance);
            } else {
                step_2_left_to_right = false;
                step_1_left_deposit = left_amount;
            }
        }

        return (
            DepositLiquidityResult(
                step_1_left_deposit,
                step_1_right_deposit,
                step_1_lp_reward,

                step_2_left_to_right,
                step_2_right_to_left,
                step_2_spent,
                step_2_pool_fee + step_2_beneficiary_fee,
                step_2_received,

                step_3_left_deposit,
                step_3_right_deposit,
                step_3_lp_reward
            ),
            step_2_pool_fee,
            step_2_beneficiary_fee
        );
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Withdraw liquidity

    function _withdrawLiquidityBase(uint128 lp_amount, address sender) private returns (TokenOperation[]) {
        uint128 left_back_amount =  math.muldiv(left_balance, lp_amount, lp_supply);
        uint128 right_back_amount = math.muldiv(right_balance, lp_amount, lp_supply);

        left_balance -= left_back_amount;
        right_balance -= right_back_amount;
        lp_supply -= lp_amount;

        TokenOperation[] operations = new TokenOperation[](0);
        operations.push(TokenOperation(left_back_amount, left_root));
        operations.push(TokenOperation(right_back_amount, right_root));

        emit WithdrawLiquidity(sender, sender, lp_amount, operations);

        return operations;
    }

    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) override external view responsible returns (uint128 expected_left_amount, uint128 expected_right_amount) {
        uint128 left_back_amount =  math.muldiv(left_balance, lp_amount, lp_supply);
        uint128 right_back_amount = math.muldiv(right_balance, lp_amount, lp_supply);

        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_back_amount, right_back_amount);
    }

    function withdrawLiquidity(
        uint64 call_id,
        uint128 lp_amount,
        address expected_lp_root,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        require(expected_lp_root == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        TokenOperation[] operations = _withdrawLiquidityBase(lp_amount, account_owner);

        _sync();

        IDexPairOperationCallback(account_owner).dexPairWithdrawSuccess{
            value: DexGas.OPERATION_CALLBACK_BASE + 3,
            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
            bounce: false
        }(call_id, true, IWithdrawResult.WithdrawResult(lp_amount, operations[0].amount, operations[1].amount));

        for (TokenOperation op: operations) {
            if (op.amount >= 0) {
                IDexAccount(msg.sender).internalPairTransfer{
                    value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                    flag: MsgFlag.SENDER_PAYS_FEES
                }(
                    op.amount,
                    op.root,
                    left_root,
                    right_root,
                    send_gas_to
                );
            }
        }

        TvmCell empty;
        IBurnableByRootTokenRoot(lp_root).burnTokens{
            value: DexGas.BURN_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(
            lp_amount,
            vault,
            send_gas_to,
            address.makeAddrStd(0, 0),
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
        if (spent_token_root == left_root) {
            (uint128 right_amount, uint128 left_pool_fee, uint128 left_beneficiary_fee) =
                _expectedExchange(amount, left_balance, right_balance);
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (right_amount, left_pool_fee + left_beneficiary_fee);
        } else if (spent_token_root == right_root) {
            (uint128 left_amount, uint128 right_pool_fee, uint128 right_beneficiary_fee) =
            _expectedExchange(amount, right_balance, left_balance);
            return {
                value: 0,
                bounce: false,
                flag: MsgFlag.REMAINING_GAS
            } (left_amount, right_pool_fee + right_beneficiary_fee);
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root
    ) override external view responsible returns (uint128 expected_amount, uint128 expected_fee) {
        if (receive_token_root == right_root) {
            return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } _expectedSpendAmount(receive_amount, left_balance, right_balance);
        } else if (receive_token_root == left_root) {
            return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } _expectedSpendAmount(receive_amount, right_balance, left_balance);
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function exchange(
        uint64 call_id,
        uint128 spent_amount,
        address spent_token_root,
        address receive_token_root,
        uint128 expected_amount,
        address account_owner,
        uint32 /*account_version*/,
        address send_gas_to
    ) override external onlyActive onlyAccount(account_owner) {
        if (spent_token_root == left_root && receive_token_root == right_root) {
            (uint128 right_amount, uint128 left_pool_fee, uint128 left_beneficiary_fee) =
                _expectedExchange(spent_amount, left_balance, right_balance);
            require(right_amount <= right_balance, DexErrors.NOT_ENOUGH_FUNDS);
            require(right_amount >= expected_amount, DexErrors.LOW_EXCHANGE_RATE);
            require(right_amount > 0, DexErrors.AMOUNT_TOO_LOW);
            require(left_pool_fee > 0 || fee.pool_numerator == 0, DexErrors.AMOUNT_TOO_LOW);
            require(left_beneficiary_fee > 0 || fee.beneficiary_numerator == 0, DexErrors.AMOUNT_TOO_LOW);

            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            left_balance += spent_amount - left_beneficiary_fee;
            right_balance -= right_amount;

            if (left_beneficiary_fee > 0) {
                accumulated_left_fee += left_beneficiary_fee;
                _processBeneficiaryFees(false, send_gas_to);
            }

            ExchangeFee[] fees;
            fees.push(ExchangeFee(left_root, left_pool_fee, left_beneficiary_fee, fee.beneficiary));

            emit Exchange(
                account_owner,
                account_owner,
                left_root,
                spent_amount,
                right_root,
                right_amount,
                fees
            );

            _sync();

            IDexPairOperationCallback(account_owner).dexPairExchangeSuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 1,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, true, IExchangeResult.ExchangeResult(true, spent_amount, left_pool_fee + left_beneficiary_fee, right_amount));

            IDexAccount(msg.sender).internalPairTransfer{
                value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                right_amount,
                right_root,
                left_root,
                right_root,
                send_gas_to
            );

            ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);

        } else if (spent_token_root == right_root && receive_token_root == left_root){
            (uint128 left_amount, uint128 right_pool_fee, uint128 right_beneficiary_fee) =
                _expectedExchange(spent_amount, right_balance, left_balance);
            require(left_amount <= left_balance, DexErrors.NOT_ENOUGH_FUNDS);
            require(left_amount >= expected_amount, DexErrors.LOW_EXCHANGE_RATE);
            require(left_amount > 0, DexErrors.AMOUNT_TOO_LOW);
            require(right_pool_fee > 0 || fee.pool_numerator == 0, DexErrors.AMOUNT_TOO_LOW);
            require(right_beneficiary_fee > 0 || fee.beneficiary_numerator == 0, DexErrors.AMOUNT_TOO_LOW);

            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            right_balance += spent_amount - right_beneficiary_fee;
            left_balance -= left_amount;

            if (right_beneficiary_fee > 0) {
                accumulated_right_fee += right_beneficiary_fee;
                _processBeneficiaryFees(false, send_gas_to);
            }

            ExchangeFee[] fees;
            fees.push(ExchangeFee(right_root, right_pool_fee, right_beneficiary_fee, fee.beneficiary));

            emit Exchange(
                account_owner,
                account_owner,
                right_root,
                spent_amount,
                left_root,
                left_amount,
                fees
            );

            _sync();

            IDexPairOperationCallback(account_owner).dexPairExchangeSuccess{
                value: DexGas.OPERATION_CALLBACK_BASE + 1,
                flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                bounce: false
            }(call_id, true, IExchangeResult.ExchangeResult(false, spent_amount, right_pool_fee + right_beneficiary_fee, left_amount));

            IDexAccount(msg.sender).internalPairTransfer{
                value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                left_amount,
                left_root,
                left_root,
                right_root,
                send_gas_to
            );

            ISuccessCallback(msg.sender).successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(call_id);

        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function _expectedExchange(uint128 a_amount, uint128 a_pool, uint128 b_pool) private view returns (uint128, uint128, uint128) {

        uint128 a_fee = math.muldivc(a_amount, fee.pool_numerator + fee.beneficiary_numerator, fee.denominator);
        uint128 a_beneficiary_fee = math.muldiv(a_fee, fee.beneficiary_numerator, fee.pool_numerator + fee.beneficiary_numerator);
        uint128 a_pool_fee = a_fee - a_beneficiary_fee;

        uint128 new_a_pool = a_pool + a_amount;
        uint128 new_b_pool = math.muldivc(a_pool, b_pool, new_a_pool - a_fee);
        uint128 expected_b_amount = b_pool - new_b_pool;

        return (expected_b_amount, a_pool_fee, a_beneficiary_fee);
    }

    function _expectedSpendAmount(uint128 b_amount, uint128 a_pool, uint128 b_pool) private view returns (uint128, uint128) {
        uint128 fee_d_minus_n = uint128(fee.denominator - fee.pool_numerator - fee.beneficiary_numerator);

        uint128 new_b_pool = b_pool - b_amount;
        uint128 new_a_pool = math.muldivc(a_pool, b_pool, new_b_pool);
        uint128 expected_a_amount = math.muldivc(new_a_pool - a_pool, fee.denominator, fee_d_minus_n);
        uint128 a_fee = math.muldivc(expected_a_amount, fee.pool_numerator + fee.beneficiary_numerator, fee.denominator);

        return (expected_a_amount, a_fee);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Fee

    function _processBeneficiaryFees(bool force, address send_gas_to) private {
        if (
            (accumulated_left_fee > 0 && force) ||
            !fee.threshold.exists(left_root) ||
            accumulated_left_fee >= fee.threshold.at(left_root)
        ) {
            IDexAccount(_expectedAccountAddress(fee.beneficiary)).internalPairTransfer{
                value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                accumulated_left_fee,
                left_root,
                left_root,
                right_root,
                send_gas_to
            );
            accumulated_left_fee = 0;
        }
        if (
            (accumulated_right_fee > 0 && force) ||
            !fee.threshold.exists(right_root) ||
            accumulated_right_fee >= fee.threshold.at(right_root)
        ) {
            IDexAccount(_expectedAccountAddress(fee.beneficiary)).internalPairTransfer{
                value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                accumulated_right_fee,
                right_root,
                left_root,
                right_root,
                send_gas_to
            );
            accumulated_right_fee = 0;
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Cross-pair exchange

    function crossPoolExchange(
        uint64 id,

        uint32 /*prev_pool_version*/,
        uint8 /*prev_pool_type*/,

        address[] prev_pool_token_roots,

        address spent_token_root,
        uint128 spent_amount,

        address sender_address,

        address original_gas_to,
        uint128 deploy_wallet_grams,

        TvmCell payload,
        bool notify_success,
        TvmCell success_payload,
        bool notify_cancel,
        TvmCell cancel_payload
    ) override external onlyPair(prev_pool_token_roots[0], prev_pool_token_roots[1]) onlyActive {

        require(msg.sender != address(this));

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        TvmSlice payloadSlice = payload.toSlice();

        uint128 expected_amount = payloadSlice.decode(uint128);
        address next_token_root =  payloadSlice.bits() >= 267 ? payloadSlice.decode(address) : address(0);

        bool has_next_payload = payloadSlice.refs() >= 1;

        TvmCell next_payload;
        if (has_next_payload) {
            next_payload = payloadSlice.loadRef();
        }

        if (spent_token_root == left_root) {
            (uint128 right_amount, uint128 left_pool_fee, uint128 left_beneficiary_fee) =
                _expectedExchange(spent_amount, left_balance, right_balance);

            if (
                right_amount <= right_balance &&
                right_amount >= expected_amount &&
                right_amount > 0 &&
                (left_pool_fee > 0 || fee.pool_numerator == 0) &&
                (left_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
            )
            {

                left_balance += spent_amount - left_beneficiary_fee;
                right_balance -= right_amount;

                if (left_beneficiary_fee > 0) {
                    accumulated_left_fee += left_beneficiary_fee;
                    _processBeneficiaryFees(false, original_gas_to);
                }

                ExchangeFee[] fees;
                fees.push(ExchangeFee(left_root, left_pool_fee, left_beneficiary_fee, fee.beneficiary));

                emit Exchange(
                    sender_address,
                    sender_address,
                    left_root,
                    spent_amount,
                    right_root,
                    right_amount,
                    fees
                );

                _sync();

                IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 4,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id, false, IExchangeResult.ExchangeResult(true, spent_amount, left_pool_fee + left_beneficiary_fee, right_amount));

                if (next_token_root.value != 0 && next_token_root != right_root && next_token_root != left_root &&
                    has_next_payload && next_payload.toSlice().bits() >= 128 &&
                    msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2) {

                    address next_pair = _expectedPairAddress(right_root, next_token_root);

                    IDexPair(next_pair).crossPoolExchange{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        id,

                        current_version,
                        DexPoolTypes.CONSTANT_PRODUCT,

                        _tokenRoots(),

                        right_root,
                        right_amount,

                        sender_address,

                        original_gas_to,
                        deploy_wallet_grams,

                        next_payload,
                        notify_success,
                        success_payload,
                        notify_cancel,
                        cancel_payload
                    );
                } else {
                    IDexVault(vault).transfer{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        right_amount,
                        right_root,
                        vault_right_wallet,
                        sender_address,
                        deploy_wallet_grams,
                        true,
                        success_payload,
                        left_root,
                        right_root,
                        current_version,
                        original_gas_to
                    );
                }
            } else {
                IDexPairOperationCallback(sender_address).dexPairOperationCancelled{
                    value: DexGas.OPERATION_CALLBACK_BASE + 44,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id);

                IDexVault(vault).transfer{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED
                }(
                    spent_amount,
                    spent_token_root,
                    vault_left_wallet,
                    sender_address,
                    deploy_wallet_grams,
                    true,
                    cancel_payload,
                    left_root,
                    right_root,
                    current_version,
                    original_gas_to
                );
            }
        } else if (spent_token_root == right_root){
            (uint128 left_amount, uint128 right_pool_fee, uint128 right_beneficiary_fee) =
                _expectedExchange(spent_amount, right_balance, left_balance);

            if (
                left_amount <= left_balance &&
                left_amount >= expected_amount &&
                left_amount > 0 &&
                (right_pool_fee > 0 || fee.pool_numerator == 0) &&
                (right_beneficiary_fee > 0 || fee.beneficiary_numerator == 0)
            )
            {
                right_balance += spent_amount - right_beneficiary_fee;
                left_balance -= left_amount;

                if (right_beneficiary_fee > 0) {
                    accumulated_right_fee += right_beneficiary_fee;
                    _processBeneficiaryFees(false, original_gas_to);
                }

                ExchangeFee[] fees;
                fees.push(ExchangeFee(right_root, right_pool_fee, right_beneficiary_fee, fee.beneficiary));

                emit Exchange(
                    sender_address,
                    sender_address,
                    right_root,
                    spent_amount,
                    left_root,
                    left_amount,
                    fees
                );

                _sync();

                IDexPairOperationCallback(sender_address).dexPairExchangeSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE + 4,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id, false, IExchangeResult.ExchangeResult(false, spent_amount, right_pool_fee + right_beneficiary_fee, left_amount));

                if (next_token_root.value != 0 && next_token_root != right_root && next_token_root != left_root &&
                    has_next_payload && next_payload.toSlice().bits() >= 128 &&
                    msg.value >= DexGas.DIRECT_PAIR_OP_MIN_VALUE_V2) {

                    address next_pair = _expectedPairAddress(left_root, next_token_root);

                    IDexPair(next_pair).crossPoolExchange{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        id,

                        current_version,
                        DexPoolTypes.CONSTANT_PRODUCT,

                        _tokenRoots(),

                        left_root,
                        left_amount,

                        sender_address,

                        original_gas_to,
                        deploy_wallet_grams,

                        next_payload,
                        notify_success,
                        success_payload,
                        notify_cancel,
                        cancel_payload
                    );
                } else {
                    IDexVault(vault).transfer{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED
                    }(
                        left_amount,
                        left_root,
                        vault_left_wallet,
                        sender_address,
                        deploy_wallet_grams,
                        true,
                        success_payload,
                        left_root,
                        right_root,
                        current_version,
                        original_gas_to
                    );
                }
            } else {
                IDexPairOperationCallback(sender_address).dexPairOperationCancelled{
                    value: DexGas.OPERATION_CALLBACK_BASE + 44,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(id);

                IDexVault(vault).transfer{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED
                }(
                    spent_amount,
                    spent_token_root,
                    vault_right_wallet,
                    sender_address,
                    deploy_wallet_grams,
                    true,
                    cancel_payload,
                    left_root,
                    right_root,
                    current_version,
                    original_gas_to
                );
            }
        } else {
            revert(DexErrors.NOT_TOKEN_ROOT);
        }
    }

    function _reserves() internal view returns(uint128[]){
        uint128[] r = new uint128[](0);
        r.push(left_balance);
        r.push(right_balance);

        return r;
    }

    function _sync() internal view {
        emit Sync(_reserves(), lp_supply);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Account operations

    function checkPair(address account_owner, uint32 /*account_version*/)
        override
        external
        onlyAccount(account_owner)
    {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        IDexAccount(msg.sender).checkPairCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
            left_root,
            right_root,
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
        require(msg.sender == left_root || msg.sender == right_root, DexErrors.NOT_TOKEN_ROOT);
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

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Code upgrade

    function upgrade(TvmCell code, uint32 new_version, uint8 new_type, address send_gas_to) override external onlyRoot {
        if (current_version == new_version && new_type == DexPoolTypes.CONSTANT_PRODUCT) {
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
            builder.store(DexPoolTypes.CONSTANT_PRODUCT);

            builder.store(platform_code);  // ref1 = platform_code

            //Tokens
            TvmBuilder tokens_data_builder;
            tokens_data_builder.store(left_root);
            tokens_data_builder.store(right_root);
            builder.storeRef(tokens_data_builder);  // ref2

            TvmCell other_data = abi.encode(
                lp_root,
                lp_wallet,
                lp_supply,

                fee,

                left_wallet,
                vault_left_wallet,
                left_balance,

                right_wallet,
                vault_right_wallet,
                right_balance
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
        TvmSlice tokens_data_slice = s.loadRefAsSlice(); // ref 2

        (left_root, right_root) = tokens_data_slice.decode(address, address);

        if (old_version == 0) {
            fee = FeeParams(1000000, 3000, 0, address(0), emptyMap);

            IDexVault(vault).addLiquidityToken{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
                address(this),
                left_root,
                right_root,
                send_gas_to
            );
        } else if (old_pool_type == DexPoolTypes.CONSTANT_PRODUCT) {
            active = true;
            TvmCell otherData = s.loadRef(); // ref 3
            (
                lp_root,
                lp_wallet,
                lp_supply,
                fee,
                left_wallet,
                vault_left_wallet,
                left_balance,
                right_wallet,
                vault_right_wallet,
                right_balance
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                address, address, uint128,
                address, address, uint128
            ));
        } else if (old_pool_type == DexPoolTypes.STABLESWAP) {
            active = true;
            TvmCell otherData = s.loadRef(); // ref 3
            IPoolTokenData.PoolTokenData[] _tokenData = new IPoolTokenData.PoolTokenData[](2);
            (
                lp_root, lp_wallet, lp_supply,
                fee,
                _tokenData,,
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                IPoolTokenData.PoolTokenData[],
                IAmplificationCoefficient.AmplificationCoefficient,
                uint256
            ));

            left_wallet = _tokenData[0].wallet;
            vault_left_wallet = _tokenData[0].vaultWallet;
            left_balance = _tokenData[0].balance;

            right_wallet = _tokenData[1].wallet;
            vault_right_wallet = _tokenData[1].vaultWallet;
            right_balance = _tokenData[1].balance;
        }

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false });
    }

    function _configureTokenRootWallets(address token_root) private view {
        ITokenRoot(token_root)
            .deployWallet {
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexPair.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        if (token_root != lp_root) {
            ITokenRoot(token_root).walletOf{
                value: DexGas.SEND_EXPECTED_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexPair.onVaultTokenWallet
           }(vault);
        }
    }

    function onTokenWallet(address wallet) external {
        require(msg.sender == left_root || msg.sender == right_root || msg.sender == lp_root, DexErrors.NOT_ROOT);

        if (msg.sender == lp_root && lp_wallet.value == 0) {
            lp_wallet = wallet;
        } else if (msg.sender == left_root && left_wallet.value == 0) {
            left_wallet = wallet;
        } else if (msg.sender == right_root && right_wallet.value == 0) {
            right_wallet = wallet;
        }

        if (
            lp_wallet.value != 0 &&
            left_wallet.value != 0 &&
            right_wallet.value != 0 &&
            vault_left_wallet.value != 0 &&
            vault_right_wallet.value != 0
        ) {
            active = true;
        }
    }

    function onVaultTokenWallet(address wallet) external {
        require(msg.sender == left_root || msg.sender == right_root, DexErrors.NOT_ROOT);

        if (msg.sender == left_root && vault_left_wallet.value == 0) {
            vault_left_wallet = wallet;
        } else if (msg.sender == right_root && vault_right_wallet.value == 0) {
            vault_right_wallet = wallet;
        }

        if (
            lp_wallet.value != 0 &&
            left_wallet.value != 0 &&
            right_wallet.value != 0 &&
            vault_left_wallet.value != 0 &&
            vault_right_wallet.value != 0
        ) {
            active = true;
        }
    }

    function liquidityTokenRootDeployed(address lp_root_, address send_gas_to) override external onlyVault {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        lp_root = lp_root_;

        _configureTokenRootWallets(lp_root);
        _configureTokenRootWallets(left_root);
        _configureTokenRootWallets(right_root);

        IDexRoot(root).onPairCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(left_root, right_root, send_gas_to);
    }

    function liquidityTokenRootNotDeployed(address /*lp_root_*/, address send_gas_to) override external onlyVault {
        if (!active) send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO, bounce: false});
        else {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
            send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS, bounce: false});
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////

    function _tokenRoots() internal view returns(address[]) {
        address[] roots = new address[](2);
        roots[0] = left_root;
        roots[1] = right_root;
        return roots;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Math
    /*
        Solve x*x + p*x - q*x = 0;
    */
    function _solveQuadraticEquationPQ(uint256 p, uint256 q) private pure returns (uint128) {
        uint256 D = math.muldiv(p, p, 4) + q;
        uint256 Dsqrt = _sqrt(D);
        if (Dsqrt > (p/2)) {
            return uint128(Dsqrt - (p/2));
        } else {
            return uint128((p/2) - Dsqrt);
        }
    }

    // Babylonian method for finding sqrt
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 xx = x;
        uint256 r = 1;
        if (xx >= 0x100000000000000000000000000000000) {
            xx >>= 128;
            r <<= 64;
        }
        if (xx >= 0x10000000000000000) {
            xx >>= 64;
            r <<= 32;
        }
        if (xx >= 0x100000000) {
            xx >>= 32;
            r <<= 16;
        }
        if (xx >= 0x10000) {
            xx >>= 16;
            r <<= 8;
        }
        if (xx >= 0x100) {
            xx >>= 8;
            r <<= 4;
        }
        if (xx >= 0x10) {
            xx >>= 4;
            r <<= 2;
        }
        if (xx >= 0x8) {
            r <<= 1;
        }
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        uint256 r1 = x / r;
        return (r < r1 ? r : r1);
    }
}
