pragma ton-solidity >= 0.57.0;

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";

import "../interfaces/IDexConstantProductPair.sol";
import "../interfaces/IDexAccount.sol";
import "../interfaces/IDexRoot.sol";
import "../interfaces/IDexVault.sol";

import "../libraries/DexPoolTypes.sol";
import "../libraries/DexGas.sol";
import "../libraries/DexAddressType.sol";
import "../libraries/DexReserveType.sol";

import "../structures/IPoolTokenData.sol";
import "../structures/IAmplificationCoefficient.sol";

import "./DexContractBase.sol";

abstract contract DexPairBase is DexContractBase, IDexConstantProductPair {
    // Base:
    address private _root;

    // Custom:
    bool internal _active;
    uint32 internal _currentVersion;

    // Addresses
    mapping(uint8 => address[]) internal _typeToRootAddresses;
    mapping(uint8 => address[]) internal _typeToWalletAddresses;
    mapping(uint8 => uint128[]) internal _typeToReserves;

    // Fee
    FeeParams internal _fee;

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
        require(_active, DexErrors.NOT_ACTIVE);
        _;
    }

    modifier onlyLiquidityTokenRoot() {
        require(
            _typeToRootAddresses[DexAddressType.LP][0].value != 0 &&
            msg.sender == _typeToRootAddresses[DexAddressType.LP][0],
            DexErrors.NOT_LP_TOKEN_ROOT
        );
        _;
    }

    modifier onlyTokenRoot() {
        require(
            (_typeToRootAddresses[DexAddressType.RESERVE][0].value != 0 && msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][0]) ||
            (_typeToRootAddresses[DexAddressType.RESERVE][1].value != 0 && msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][1]),
            DexErrors.NOT_TOKEN_ROOT
        );
        _;
    }

    modifier onlyRoot() {
        require(_root.value != 0 && msg.sender == _root, DexErrors.NOT_ROOT);
        _;
    }

    modifier onlyVault() {
        require(
            _typeToRootAddresses[DexAddressType.VAULT][0].value != 0 &&
            msg.sender == _typeToRootAddresses[DexAddressType.VAULT][0],
            DexErrors.NOT_VAULT
        );
        _;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Getters

    // Return dex root address
    function getRoot() override external view responsible returns (address dex_root) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _root;
    }

    // Return token roots addresses
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
            _typeToRootAddresses[DexAddressType.RESERVE][0],
            _typeToRootAddresses[DexAddressType.RESERVE][1],
            _typeToRootAddresses[DexAddressType.LP][0]
        );
    }

    // Return pair's wallets addresses
    function getTokenWallets() override external view responsible returns (
        address left,
        address right,
        address lp
    ) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            _typeToWalletAddresses[DexAddressType.RESERVE][0],
            _typeToWalletAddresses[DexAddressType.RESERVE][1],
            _typeToWalletAddresses[DexAddressType.LP][0]
        );
    }

    // Return current version
    function getVersion() override external view responsible returns (uint32 version) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _currentVersion;
    }

    // Return type of the pair's pool
    function getPoolType() override external view responsible returns (uint8) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } DexPoolTypes.CONSTANT_PRODUCT;
    }

    // Return vault address
    function getVault() override external view responsible returns (address dex_vault) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _typeToRootAddresses[DexAddressType.VAULT][0];
    }

    // Return vault wallets addresses
    function getVaultWallets() override external view responsible returns (
        address left,
        address right
    ) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            _typeToWalletAddresses[DexAddressType.VAULT][0],
            _typeToWalletAddresses[DexAddressType.VAULT][1]
        );
    }

    // Return fee options
    function getFeeParams() override external view responsible returns (FeeParams) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _fee;
    }

    // return packed values of accumulated fees
    function getAccumulatedFees() override external view responsible returns (uint128[] accumulatedFees) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _typeToReserves[DexReserveType.FEE];
    }

    // is pair active
    function isActive() override external view responsible returns (bool) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _active;
    }

    // return current pair's reserves
    function getBalances() override external view responsible returns (IDexPairBalances) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } IDexPairBalances(
            _typeToReserves[DexReserveType.LP][0],
            _typeToReserves[DexReserveType.POOL][0],
            _typeToReserves[DexReserveType.POOL][1]
        );
    }

    function setFeeParams(
        FeeParams _params,
        address _remainingGasTo
    ) override external onlyRoot {
        // Check input params
        require(
            _params.denominator != 0 &&
            (_params.pool_numerator + _params.beneficiary_numerator) < _params.denominator &&
            ((_params.beneficiary.value != 0 && _params.beneficiary_numerator != 0) ||
            (_params.beneficiary.value == 0 && _params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS
        );
        require(msg.value >= DexGas.SET_FEE_PARAMS_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Flush all fees from pair
        if (_fee.beneficiary.value != 0) {
            _processBeneficiaryFees(true, _remainingGasTo);
        }

        // Update fee options and notify
        _fee = _params;
        emit FeesParamsUpdated(_fee);

        // Refund remaining gas
        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    function withdrawBeneficiaryFee(address send_gas_to) external {
        require(_fee.beneficiary.value != 0 && msg.sender == _fee.beneficiary, DexErrors.NOT_BENEFICIARY);
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Withdraw left and right accumulated fees
        _processBeneficiaryFees(true, send_gas_to);

        // Refund remaining gas
        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function checkPair(address _accountOwner, uint32) override external onlyAccount(_accountOwner) {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Notify account about pair
        IDexAccount(msg.sender)
            .checkPairCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _typeToRootAddresses[DexAddressType.RESERVE][0],
                _typeToRootAddresses[DexAddressType.RESERVE][1],
                _typeToRootAddresses[DexAddressType.LP][0]
            );
    }

    function upgrade(
        TvmCell _code,
        uint32 _newVersion,
        uint8 _newType,
        address _remainingGasTo
    ) override external onlyRoot {
        if (_currentVersion == _newVersion && _newType == DexPoolTypes.CONSTANT_PRODUCT) {
            tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                bounce: false
            });
        } else {
            if (_fee.beneficiary.value != 0) {
                _processBeneficiaryFees(true, _remainingGasTo);
            }

            emit PairCodeUpgraded(_newVersion, _newType);

            TvmBuilder builder;

            builder.store(_root);
            builder.store(_currentVersion);
            builder.store(_newVersion);
            builder.store(_remainingGasTo);
            builder.store(DexPoolTypes.CONSTANT_PRODUCT);
            builder.store(platform_code);  // ref1 = platform_code

            TvmCell otherData = abi.encode(
                _fee,
                _typeToReserves,
                _typeToRootAddresses,
                _typeToWalletAddresses
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

        address vault;
        address remainingGasTo;
        uint32 oldVersion;
        uint8 oldPoolType = DexPoolTypes.CONSTANT_PRODUCT;

        // Unpack base data
        (
            _root,
            vault,
            oldVersion,
            _currentVersion,
            remainingGasTo
        ) = dataSlice.decode(
            address,
            address,
            uint32,
            uint32,
            address
        );

        _typeToRootAddresses[DexAddressType.VAULT].push(vault);

        if (dataSlice.bits() >= 8) {
            oldPoolType = dataSlice.decode(uint8);
        }

        // Load platform's code
        platform_code = dataSlice.loadRef(); // ref 1

        address leftRoot;
        address rightRoot;

        // Load tokens' roots addresses
        TvmSlice tokensDataSlice = dataSlice.loadRefAsSlice(); // ref 2
        (leftRoot, rightRoot) = tokensDataSlice.decode(address, address);

        _typeToRootAddresses[DexAddressType.RESERVE].push(leftRoot);
        _typeToRootAddresses[DexAddressType.RESERVE].push(rightRoot);
        _typeToReserves[DexReserveType.FEE].push(0);
        _typeToReserves[DexReserveType.FEE].push(0);

        if (oldVersion == 0) {
            _fee = FeeParams(1000000, 3000, 0, address(0), emptyMap);

            IDexVault(_typeToRootAddresses[DexAddressType.VAULT][0])
                .addLiquidityToken{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    address(this),
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    remainingGasTo
                );
        } else if (oldPoolType == DexPoolTypes.CONSTANT_PRODUCT) {
            _active = true;
            TvmCell otherData = dataSlice.loadRef(); // ref 3

            address lpRoot;
            address lpWallet;
            address leftWallet;
            address vaultLeftWallet;
            address rightWallet;
            address vaultRightWallet;
            uint128 lpSupply;
            uint128 leftBalance;
            uint128 rightBalance;

            // Set reserves and fee options
            (
                lpRoot, lpWallet, lpSupply,
                _fee,
                leftWallet, vaultLeftWallet, leftBalance,
                rightWallet, vaultRightWallet, rightBalance
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                address, address, uint128,
                address, address, uint128
            ));

            _typeToRootAddresses[DexAddressType.LP].push(lpRoot);
            _typeToWalletAddresses[DexAddressType.LP].push(lpWallet);
            _typeToReserves[DexReserveType.LP].push(lpSupply);

            _typeToWalletAddresses[DexAddressType.RESERVE].push(leftWallet);
            _typeToWalletAddresses[DexAddressType.VAULT].push(vaultLeftWallet);
            _typeToReserves[DexReserveType.POOL].push(leftBalance);

            _typeToWalletAddresses[DexAddressType.RESERVE].push(rightWallet);
            _typeToWalletAddresses[DexAddressType.VAULT].push(vaultRightWallet);
            _typeToReserves[DexReserveType.POOL].push(rightBalance);
        } else if (oldPoolType == DexPoolTypes.STABLESWAP) {
            _active = true;
            TvmCell otherData = dataSlice.loadRef(); // ref 3
            IPoolTokenData.PoolTokenData[] tokensData = new IPoolTokenData.PoolTokenData[](2);

            address lpRoot;
            address lpWallet;
            uint128 lpSupply;

            // Set lp reserve and fee options
            (
                lpRoot, lpWallet, lpSupply,
                _fee,
                tokensData,,
            ) = abi.decode(otherData, (
                address, address, uint128,
                FeeParams,
                IPoolTokenData.PoolTokenData[],
                IAmplificationCoefficient.AmplificationCoefficient,
                uint256
            ));

            _typeToReserves[DexReserveType.LP].push(lpSupply);

            // Set left reserve
            _typeToWalletAddresses[DexAddressType.RESERVE].push(tokensData[0].wallet);
            _typeToWalletAddresses[DexAddressType.VAULT].push(tokensData[0].vaultWallet);
            _typeToReserves[DexReserveType.POOL].push(tokensData[0].balance);

            // Set right reserve
            _typeToWalletAddresses[DexAddressType.RESERVE].push(tokensData[1].wallet);
            _typeToWalletAddresses[DexAddressType.VAULT].push(tokensData[1].vaultWallet);
            _typeToReserves[DexReserveType.POOL].push(tokensData[1].balance);
        }

        // Refund remaining gas
        remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function onTokenWallet(address _wallet) external {
        require(
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][0] ||
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][1] ||
            msg.sender == _typeToRootAddresses[DexAddressType.LP][0],
            DexErrors.NOT_ROOT
        );

        // Set wallets addresses
        if (
            msg.sender == _typeToRootAddresses[DexAddressType.LP][0] &&
            _typeToWalletAddresses[DexAddressType.LP].length == 0
        ) {
            _typeToWalletAddresses[DexAddressType.LP].push(_wallet);
            _typeToReserves[DexReserveType.LP].push(0);
        } else if (
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][0] &&
            _typeToWalletAddresses[DexAddressType.RESERVE].length == 0
        ) {
            _typeToWalletAddresses[DexAddressType.RESERVE].push(_wallet);
            _typeToReserves[DexReserveType.POOL].push(0);
            _typeToReserves[DexReserveType.FEE].push(0);
        } else if (
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][1] &&
            _typeToWalletAddresses[DexAddressType.RESERVE].length == 1
        ) {
            _typeToWalletAddresses[DexAddressType.RESERVE].push(_wallet);
            _typeToReserves[DexReserveType.POOL].push(0);
            _typeToReserves[DexReserveType.FEE].push(0);
        }

        _tryToActivate();
    }

    function onVaultTokenWallet(address _wallet) external {
        require(
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][0] ||
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][1],
            DexErrors.NOT_ROOT
        );

        // Set vault wallets addresses
        if (
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][0] &&
            _typeToWalletAddresses[DexAddressType.VAULT].length == 0
        ) {
            _typeToWalletAddresses[DexAddressType.VAULT].push(_wallet);
        } else if (
            msg.sender == _typeToRootAddresses[DexAddressType.RESERVE][1] &&
            _typeToWalletAddresses[DexAddressType.VAULT].length == 1
        ) {
            _typeToWalletAddresses[DexAddressType.VAULT].push(_wallet);
        }

        _tryToActivate();
    }

    // Will activate pair if all wallets are set
    function _tryToActivate() private {
        if (
            _typeToWalletAddresses[DexAddressType.LP].length == 1 &&
            _typeToWalletAddresses[DexAddressType.RESERVE].length == 2 &&
            _typeToWalletAddresses[DexAddressType.VAULT].length == 2
        ) {
            _active = true;
        }
    }

    function liquidityTokenRootDeployed(
        address _lpRootAddress,
        address _remainingGasTo
    ) override external onlyVault {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        _typeToRootAddresses[DexAddressType.LP].push(_lpRootAddress);

        // Deploy wallets for pair
        _configureTokenRootWallets(_typeToRootAddresses[DexAddressType.LP][0]);
        _configureTokenRootWallets(_typeToRootAddresses[DexAddressType.RESERVE][0]);
        _configureTokenRootWallets(_typeToRootAddresses[DexAddressType.RESERVE][1]);

        // Notify root that pair was created
        IDexRoot(_root)
            .onPairCreated{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _typeToRootAddresses[DexAddressType.RESERVE][0],
                _typeToRootAddresses[DexAddressType.RESERVE][1],
                _remainingGasTo
            );
    }

    function liquidityTokenRootNotDeployed(
        address,
        address _remainingGasTo
    ) override external onlyVault {
        if (!_active) {
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
        return _root;
    }

    // Return accumulated fees
    function _processBeneficiaryFees(
        bool _isForce,
        address _remainingGasTo
    ) internal {
        // Return left fee
        if (
            (_typeToReserves[DexReserveType.FEE][0] > 0 && _isForce) ||
            !_fee.threshold.exists(_typeToRootAddresses[DexAddressType.RESERVE][0]) ||
            _typeToReserves[DexReserveType.FEE][0] >= _fee.threshold.at(_typeToRootAddresses[DexAddressType.RESERVE][0])
        ) {
            IDexAccount(_expectedAccountAddress(_fee.beneficiary))
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    _typeToReserves[DexReserveType.FEE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _remainingGasTo
                );

            _typeToReserves[DexReserveType.FEE][0] = 0;
        }

        // Return right fee
        if (
            (_typeToReserves[DexReserveType.FEE][1] > 0 && _isForce) ||
            !_fee.threshold.exists(_typeToRootAddresses[DexAddressType.RESERVE][1]) ||
            _typeToReserves[DexReserveType.FEE][1] >= _fee.threshold.at(_typeToRootAddresses[DexAddressType.RESERVE][1])
        ) {
            IDexAccount(_expectedAccountAddress(_fee.beneficiary))
                .internalPairTransfer{ value: DexGas.INTERNAL_PAIR_TRANSFER_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
                (
                    _typeToReserves[DexReserveType.FEE][1],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _typeToRootAddresses[DexAddressType.RESERVE][0],
                    _typeToRootAddresses[DexAddressType.RESERVE][1],
                    _remainingGasTo
                );

            _typeToReserves[DexReserveType.FEE][1] = 0;
        }
    }

    // Pack left and right reserves and return them
    function _reserves() internal view returns (uint128[]) {
        return _typeToReserves[DexReserveType.POOL];
    }

    // Emits updated reserves
    function _sync() internal view {
        emit Sync(_reserves(), _typeToReserves[DexReserveType.LP][0]);
    }

    // Pack left and right TIP-3 token roots and return them
    function _tokenRoots() internal view returns (address[]) {
        return _typeToRootAddresses[DexAddressType.RESERVE];
    }

    // Deploys wallet by TIP-3 token root
    function _configureTokenRootWallets(address _tokenRoot) private view {
        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexPairBase.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);

        if (_tokenRoot != _typeToRootAddresses[DexAddressType.LP][0]) {
            ITokenRoot(_tokenRoot)
                .walletOf{
                    value: DexGas.SEND_EXPECTED_WALLET_VALUE,
                    flag: MsgFlag.SENDER_PAYS_FEES,
                    callback: DexPairBase.onVaultTokenWallet
                }(_typeToRootAddresses[DexAddressType.VAULT][0]);
        }
    }
}
