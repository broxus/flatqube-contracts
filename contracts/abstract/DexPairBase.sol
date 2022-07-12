pragma ton-solidity >= 0.57.0;

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";

import "../interfaces/IDexConstantProductPair.sol";
import "../interfaces/IDexAccount.sol";
import "../interfaces/IDexRoot.sol";
import "../interfaces/IDexVault.sol";

import "../libraries/DexPoolTypes.sol";
import "../libraries/DexGas.sol";

import "../structures/IPoolTokenData.sol";
import "../structures/IAmplificationCoefficient.sol";

import "./DexContractBase.sol";

abstract contract DexPairBase is DexContractBase, IDexConstantProductPair {
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

    // Prevent manual transfers
    receive() external pure {
        revert();
    }

    // Prevent undefined functions call, need for bounce future Account/Root functions calls, when not upgraded
    fallback() external pure {
        revert();
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Modifiers

    modifier onlyActive() {
        require(active, DexErrors.NOT_ACTIVE);
        _;
    }

    modifier onlyLiquidityTokenRoot() {
        require(lp_root.value != 0 && msg.sender == lp_root, DexErrors.NOT_LP_TOKEN_ROOT);
        _;
    }

    modifier onlyTokenRoot() {
        require(
            (left_root.value != 0 && msg.sender == left_root) ||
            (right_root.value != 0 && msg.sender == right_root),
            DexErrors.NOT_TOKEN_ROOT
        );
        _;
    }

    modifier onlyRoot() {
        require(root.value != 0 && msg.sender == root, DexErrors.NOT_ROOT);
        _;
    }

    modifier onlyVault() {
        require(vault.value != 0 && msg.sender == vault, DexErrors.NOT_VAULT);
        _;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Getters

    function getRoot() override external view responsible returns (address dex_root) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } root;
    }

    function getTokenRoots() override external view responsible returns (
        address left,
        address right,
        address lp
    ) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            left_root,
            right_root,
            lp_root
        );
    }

    function getTokenWallets()override external view responsible returns (
        address left,
        address right,
        address lp
    ) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            left_wallet,
            right_wallet,
            lp_wallet
        );
    }

    function getVersion() override external view responsible returns (uint32 version) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } current_version;
    }

    function getPoolType() override external view responsible returns (uint8) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } DexPoolTypes.CONSTANT_PRODUCT;
    }

    function getVault() override external view responsible returns (address dex_vault) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } vault;
    }

    function getVaultWallets() override external view responsible returns (
        address left,
        address right
    ) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            vault_left_wallet,
            vault_right_wallet
        );
    }

    function getFeeParams() override external view responsible returns (FeeParams) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } fee;
    }

    function getAccumulatedFees() override external view responsible returns (uint128[] accumulatedFees) {
        uint128[] _accumulatedFees = new uint128[](2);

        _accumulatedFees[0] = accumulated_left_fee;
        _accumulatedFees[1] = accumulated_right_fee;

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _accumulatedFees;
    }

    function isActive() override external view responsible returns (bool) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } active;
    }

    function getBalances() override external view responsible returns (IDexPairBalances) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } IDexPairBalances(
            lp_supply,
            left_balance,
            right_balance
        );
    }

    function setFeeParams(
        FeeParams params,
        address send_gas_to
    ) override external onlyRoot {
        require(
            params.denominator != 0 &&
            (params.pool_numerator + params.beneficiary_numerator) < params.denominator &&
            ((params.beneficiary.value != 0 && params.beneficiary_numerator != 0) ||
            (params.beneficiary.value == 0 && params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS
        );
        require(msg.value >= DexGas.SET_FEE_PARAMS_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        if (fee.beneficiary.value != 0) {
            _processBeneficiaryFees(true, send_gas_to);
        }

        fee = params;
        emit FeesParamsUpdated(fee);

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    function withdrawBeneficiaryFee(address send_gas_to) external {
        require(fee.beneficiary.value != 0 && msg.sender == fee.beneficiary, DexErrors.NOT_BENEFICIARY);

        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        _processBeneficiaryFees(true, send_gas_to);

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function checkPair(address account_owner, uint32) override external onlyAccount(account_owner) {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        IDexAccount(msg.sender)
            .checkPairCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (left_root, right_root, lp_root);
    }

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

    function onTokenWallet(address wallet) external {
        require(
            msg.sender == left_root ||
            msg.sender == right_root ||
            msg.sender == lp_root,
            DexErrors.NOT_ROOT
        );

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

    function liquidityTokenRootDeployed(
        address lp_root_,
        address send_gas_to
    ) override external onlyVault {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        lp_root = lp_root_;

        _configureTokenRootWallets(lp_root);
        _configureTokenRootWallets(left_root);
        _configureTokenRootWallets(right_root);

        IDexRoot(root)
            .onPairCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (left_root, right_root, send_gas_to);
    }

    function liquidityTokenRootNotDeployed(
        address,
        address send_gas_to
    ) override external onlyVault {
        if (!active) {
            send_gas_to.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO,
                bounce: false
            });
        } else {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            send_gas_to.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                bounce: false
            });
        }
    }

    function _dexRoot() override internal view returns (address) {
        return root;
    }

    function _processBeneficiaryFees(
        bool force,
        address send_gas_to
    ) internal {
        if (
            (accumulated_left_fee > 0 && force) ||
            !fee.threshold.exists(left_root) ||
            accumulated_left_fee >= fee.threshold.at(left_root)
        ) {
            IDexAccount(_expectedAccountAddress(fee.beneficiary))
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
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
            IDexAccount(_expectedAccountAddress(fee.beneficiary))
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    accumulated_right_fee,
                    right_root,
                    left_root,
                    right_root,
                    send_gas_to
                );

            accumulated_right_fee = 0;
        }
    }

    function _reserves() internal view returns (uint128[]) {
        uint128[] r = new uint128[](0);

        r.push(left_balance);
        r.push(right_balance);

        return r;
    }

    function _sync() internal view {
        emit Sync(_reserves(), lp_supply);
    }

    function _tokenRoots() internal view returns (address[]) {
        address[] roots = new address[](2);

        roots[0] = left_root;
        roots[1] = right_root;

        return roots;
    }

    function _configureTokenRootWallets(address token_root) private view {
        ITokenRoot(token_root)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexPairBase.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        if (token_root != lp_root) {
            ITokenRoot(token_root)
                .walletOf{
                    value: DexGas.SEND_EXPECTED_WALLET_VALUE,
                    flag: MsgFlag.SENDER_PAYS_FEES,
                    callback: DexPairBase.onVaultTokenWallet
                }(vault);
        }
    }
}
