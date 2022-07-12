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
    address private root;
    address internal vault;

    // Custom:
    bool internal active;
    uint32 internal current_version;

    // Params:
    address internal left_root;
    address internal right_root;

    // Wallets
    address internal lp_wallet;
    address internal left_wallet;
    address internal right_wallet;

    // Vault wallets
    address internal vault_left_wallet;
    address internal vault_right_wallet;

    // Liquidity tokens
    address internal lp_root;
    uint128 internal lp_supply;

    // Balances
    uint128 internal left_balance;
    uint128 internal right_balance;

    // Fee
    FeeParams internal fee;
    uint128 internal accumulated_left_fee;
    uint128 internal accumulated_right_fee;

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
        uint128[] fees = new uint128[](2);

        fees[0] = accumulated_left_fee;
        fees[1] = accumulated_right_fee;

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } fees;
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
        FeeParams _params,
        address _remainingGasTo
    ) override external onlyRoot {
        require(
            _params.denominator != 0 &&
            (_params.pool_numerator + _params.beneficiary_numerator) < _params.denominator &&
            ((_params.beneficiary.value != 0 && _params.beneficiary_numerator != 0) ||
            (_params.beneficiary.value == 0 && _params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS
        );
        require(msg.value >= DexGas.SET_FEE_PARAMS_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        if (fee.beneficiary.value != 0) {
            _processBeneficiaryFees(true, _remainingGasTo);
        }

        fee = _params;
        emit FeesParamsUpdated(fee);

        _remainingGasTo.transfer({
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

    function checkPair(address _accountOwner, uint32) override external onlyAccount(_accountOwner) {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        IDexAccount(msg.sender)
            .checkPairCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (left_root, right_root, lp_root);
    }

    function upgrade(
        TvmCell _code,
        uint32 _newVersion,
        uint8 _newType,
        address _remainingGasTo
    ) override external onlyRoot {
        if (current_version == _newVersion && _newType == DexPoolTypes.CONSTANT_PRODUCT) {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                bounce: false
            });
        } else {
            if (fee.beneficiary.value != 0) {
                _processBeneficiaryFees(true, _remainingGasTo);
            }

            emit PairCodeUpgraded(_newVersion, _newType);

            TvmBuilder builder;

            builder.store(root);
            builder.store(vault);
            builder.store(current_version);
            builder.store(_newVersion);
            builder.store(_remainingGasTo);
            builder.store(DexPoolTypes.CONSTANT_PRODUCT);
            builder.store(platform_code);  // ref1 = platform_code

            //Tokens
            TvmBuilder tokensDataBuilder;

            tokensDataBuilder.store(left_root);
            tokensDataBuilder.store(right_root);

            builder.storeRef(tokensDataBuilder);  // ref2

            TvmCell otherData = abi.encode(
                lp_root, lp_wallet, lp_supply,
                fee,
                left_wallet, vault_left_wallet, left_balance,
                right_wallet, vault_right_wallet, right_balance
            );

            builder.store(otherData);   // ref3

            // set code after complete this method
            tvm.setcode(_code);
            tvm.setCurrentCode(_code);

            onCodeUpgrade(builder.toCell());
        }
    }

    function onCodeUpgrade(TvmCell _data) private {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);
        tvm.resetStorage();

        TvmSlice dataSlice = _data.toSlice();

        address remainingGasTo;
        uint32 oldVersion;
        uint8 oldPoolType = DexPoolTypes.CONSTANT_PRODUCT;

        // Unpack base data
        (
            root,
            vault,
            oldVersion,
            current_version,
            remainingGasTo
        ) = dataSlice.decode(
            address,
            address,
            uint32,
            uint32,
            address
        );

        if (dataSlice.bits() >= 8) {
            oldPoolType = dataSlice.decode(uint8);
        }

        // Load platform's code
        platform_code = dataSlice.loadRef(); // ref 1

        // Load tokens' roots addresses
        TvmSlice tokensDataSlice = dataSlice.loadRefAsSlice(); // ref 2
        (left_root, right_root) = tokensDataSlice.decode(address, address);

        if (oldVersion == 0) {
            fee = FeeParams(1000000, 3000, 0, address(0), emptyMap);

            IDexVault(vault)
                .addLiquidityToken{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (address(this), left_root, right_root, remainingGasTo);
        } else if (oldPoolType == DexPoolTypes.CONSTANT_PRODUCT) {
            active = true;
            TvmCell otherData = dataSlice.loadRef(); // ref 3

            (
                lp_root, lp_wallet, lp_supply,
                fee,
                left_wallet, vault_left_wallet, left_balance,
                right_wallet, vault_right_wallet, right_balance
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                address, address, uint128,
                address, address, uint128
            ));
        } else if (oldPoolType == DexPoolTypes.STABLESWAP) {
            active = true;
            TvmCell otherData = dataSlice.loadRef(); // ref 3
            IPoolTokenData.PoolTokenData[] tokensData = new IPoolTokenData.PoolTokenData[](2);

            (
                lp_root, lp_wallet, lp_supply,
                fee,
                tokensData,,
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                IPoolTokenData.PoolTokenData[],
                IAmplificationCoefficient.AmplificationCoefficient,
                uint256
            ));

            left_wallet = tokensData[0].wallet;
            vault_left_wallet = tokensData[0].vaultWallet;
            left_balance = tokensData[0].balance;

            right_wallet = tokensData[1].wallet;
            vault_right_wallet = tokensData[1].vaultWallet;
            right_balance = tokensData[1].balance;
        }

        remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function onTokenWallet(address _wallet) external {
        require(
            msg.sender == left_root ||
            msg.sender == right_root ||
            msg.sender == lp_root,
            DexErrors.NOT_ROOT
        );

        if (msg.sender == lp_root && lp_wallet.value == 0) {
            lp_wallet = _wallet;
        } else if (msg.sender == left_root && left_wallet.value == 0) {
            left_wallet = _wallet;
        } else if (msg.sender == right_root && right_wallet.value == 0) {
            right_wallet = _wallet;
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

    function onVaultTokenWallet(address _wallet) external {
        require(msg.sender == left_root || msg.sender == right_root, DexErrors.NOT_ROOT);

        if (msg.sender == left_root && vault_left_wallet.value == 0) {
            vault_left_wallet = _wallet;
        } else if (msg.sender == right_root && vault_right_wallet.value == 0) {
            vault_right_wallet = _wallet;
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
        address _lpRoot,
        address _remainingGasTo
    ) override external onlyVault {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        lp_root = _lpRoot;

        _configureTokenRootWallets(lp_root);
        _configureTokenRootWallets(left_root);
        _configureTokenRootWallets(right_root);

        IDexRoot(root)
            .onPairCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (left_root, right_root, _remainingGasTo);
    }

    function liquidityTokenRootNotDeployed(
        address,
        address _remainingGasTo
    ) override external onlyVault {
        if (!active) {
            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO,
                bounce: false
            });
        } else {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            _remainingGasTo.transfer({
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
        bool _isForce,
        address _remainingGasTo
    ) internal {
        if (
            (accumulated_left_fee > 0 && _isForce) ||
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
                    _remainingGasTo
                );

            accumulated_left_fee = 0;
        }

        if (
            (accumulated_right_fee > 0 && _isForce) ||
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
                    _remainingGasTo
                );

            accumulated_right_fee = 0;
        }
    }

    function _reserves() internal view returns (uint128[]) {
        uint128[] reserves = new uint128[](0);

        reserves.push(left_balance);
        reserves.push(right_balance);

        return reserves;
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

    function _configureTokenRootWallets(address _tokenRoot) private view {
        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexPairBase.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        if (_tokenRoot != lp_root) {
            ITokenRoot(_tokenRoot)
                .walletOf{
                    value: DexGas.SEND_EXPECTED_WALLET_VALUE,
                    flag: MsgFlag.SENDER_PAYS_FEES,
                    callback: DexPairBase.onVaultTokenWallet
                }(vault);
        }
    }
}
