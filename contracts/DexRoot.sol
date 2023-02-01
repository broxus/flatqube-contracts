pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "./abstract/DexContractBase.sol";

import "./interfaces/IUpgradable.sol";
import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexBasePool.sol";
import "./interfaces/IDexStablePair.sol";
import "./interfaces/IDexConstantProductPair.sol";
import "./interfaces/IResetGas.sol";
import "./interfaces/ILiquidityTokenRootDeployedCallback.sol";
import "./interfaces/ILiquidityTokenRootNotDeployedCallback.sol";

import "./libraries/DexPlatformTypes.sol";
import "./libraries/DexErrors.sol";
import "./libraries/DexPoolTypes.sol";
import "./libraries/DexGas.sol";

import "./structures/IAmplificationCoefficient.sol";

import "./DexPlatform.sol";

contract DexRoot is
    DexContractBase,
    IDexRoot,
    IResetGas,
    IUpgradable,
    IAmplificationCoefficient
{
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // DATA
    uint32 static _nonce;

    TvmCell private _accountCode;
    uint32 private _accountVersion;

    mapping(uint8 => TvmCell) private _pairCodes;
    mapping(uint8 => uint32) private _pairVersions;

    mapping(uint8 => TvmCell) private _poolCodes;
    mapping(uint8 => uint32) private _poolVersions;

    TvmCell private _vaultCode;
    uint32 private _vaultVersion;

    TvmCell private _lpTokenPendingCode;
    uint32 private _lpTokenPendingVersion;

    address private _vault;
    address private _tokenFactory;
    bool private _active;

    address private _owner;
    address private _pendingOwner;
    address private _manager;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // MODIFIERS

    modifier onlyManagerOrOwner() {
        require(
            msg.sender.value != 0 &&
            (msg.sender == _owner || msg.sender == _manager),
            DexErrors.NOT_MY_OWNER
        );
        _;
    }

    modifier onlyActive() {
        require(_active, DexErrors.NOT_ACTIVE);
        _;
    }

    modifier onlyOwner() {
        require(_owner.value != 0 && msg.sender == _owner, DexErrors.NOT_MY_OWNER);
        _;
    }

//    modifier onlyVault() {
//        require(_vault.value != 0 && msg.sender == _vault, DexErrors.NOT_VAULT);
//        _;
//    }

    constructor(address initial_owner) public {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);
        tvm.accept();

        _owner = initial_owner;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function _dexRoot() override internal view returns(address) {
        return address(this);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // GETTERS

    function getAccountVersion() override external view responsible returns (uint32) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _accountVersion;
    }

    function getAccountCode() override external view responsible returns (TvmCell) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _accountCode;
    }

    function getPairVersion(uint8 pool_type) override external view responsible returns (uint32) {
        require(_pairVersions.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _pairVersions[pool_type];
    }

    function getPoolVersion(uint8 pool_type) override external view responsible returns (uint32) {
        require(_poolVersions.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _poolVersions[pool_type];
    }

    function getPairCode(uint8 pool_type) override external view responsible returns (TvmCell) {
        require(_pairCodes.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _pairCodes[pool_type];
    }

    function getPoolCode(uint8 pool_type) override external view responsible returns (TvmCell) {
        require(_poolCodes.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _poolCodes[pool_type];
    }

    function getVaultCode() override external view responsible returns (TvmCell) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _vaultCode;
    }

    function getVaultVersion() override external view responsible returns (uint32) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _vaultVersion;
    }

    function getLpTokenPendingCode() override external view responsible returns (TvmCell) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _lpTokenPendingCode;
    }

    function getLpTokenPendingVersion() override external view responsible returns (uint32) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _lpTokenPendingVersion;
    }

    function getTokenFactory() override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _tokenFactory;
    }

    function isActive() override external view responsible returns (bool) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _active;
    }

    function getOwner() external view responsible returns (address dex_owner) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _owner;
    }

    function getPendingOwner() external view responsible returns (address dex_pending_owner) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _pendingOwner;
    }

    function getExpectedAccountAddress(address account_owner) override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _expectedAccountAddress(account_owner);
    }

    function getExpectedPairAddress(
        address left_root,
        address right_root
    ) override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _expectedPoolAddress([left_root, right_root]);
    }

    function getExpectedPoolAddress(address[] _roots) override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _expectedPoolAddress(_roots);
    }

    function getExpectedTokenVaultAddress(address _tokenRoot) override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _expectedTokenVaultAddress(_tokenRoot);
    }

    function getManager() external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _manager;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // SETTERS

    function setVaultOnce(address new_vault) external onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _vault = new_vault;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function setActive(bool new_active) external onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        if (
            new_active &&
            !platform_code.toSlice().empty() &&
            _vaultVersion > 0 &&
            _accountVersion > 0 &&
            !_pairVersions.empty()
        ) {
            _active = true;
        } else {
            _active = false;
        }

        emit ActiveUpdated(_active);

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function setManager(address _newManager) external onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _manager = _newManager;

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }

    function revokeManager() external onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _manager = address(0);

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }

    function transferOwner(address new_owner) external onlyOwner {
        emit RequestedOwnerTransfer(_owner, new_owner);

        _pendingOwner = new_owner;
    }

    function acceptOwner() external {
        require(
            msg.sender == _pendingOwner &&
            msg.sender.value != 0,
            DexErrors.NOT_PENDING_OWNER
        );

        emit OwnerTransferAccepted(_owner, _pendingOwner);

        _owner = _pendingOwner;
        _pendingOwner = address.makeAddrStd(0, 0);
    }

    function setTokenFactory(
        address _newTokenFactory,
        address _remainingGasTo
    ) external override onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _tokenFactory = _newTokenFactory;

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // INSTALL CODE

    function installPlatformOnce(TvmCell code) external onlyOwner {
        // can be installed only once
        require(platform_code.toSlice().empty(), DexErrors.PLATFORM_CODE_NON_EMPTY);

        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        platform_code = code;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdateAccountCode(TvmCell code) external onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _accountCode = code;
        _accountVersion++;

        emit AccountCodeUpgraded(_accountVersion);

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdatePairCode(
        TvmCell code,
        uint8 pool_type
    ) external onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _pairCodes[pool_type] = code;
        _pairVersions[pool_type]++;

        emit PairCodeUpgraded(_pairVersions[pool_type], pool_type);

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdatePoolCode(
        TvmCell code,
        uint8 pool_type
    ) external onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        _poolCodes[pool_type] = code;
        _poolVersions[pool_type]++;

        emit PoolCodeUpgraded(_poolVersions[pool_type], pool_type);

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdateVaultCode(
        TvmCell _newCode,
        address _remainingGasTo
    ) external override onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        require(!_newCode.toSlice().empty(), DexErrors.VAULT_CODE_EMPTY);

        _vaultCode = _newCode;
        _vaultVersion += 1;

        emit VaultCodeUpgraded({
            version: _vaultVersion,
            codeHash: tvm.hash(_vaultCode)
        });

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function installOrUpdateLpTokenPendingCode(
        TvmCell _newCode,
        address _remainingGasTo
    ) external override onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        require(!_newCode.toSlice().empty(), DexErrors.VAULT_CODE_EMPTY);

        _lpTokenPendingCode = _newCode;
        _lpTokenPendingVersion += 1;

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // INTERNAL

    function upgrade(TvmCell code) override external onlyOwner {
        require(msg.value > DexGas.UPGRADE_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        emit RootCodeUpgraded();

        TvmCell data = abi.encode(
            platform_code,
            _accountCode,
            _accountVersion,
            _pairCodes,
            _pairVersions,
            _poolCodes,
            _poolVersions,
            _owner,
            _vaultCode,
            _vaultVersion,
            _pendingOwner
        );

        tvm.setcode(code);
        tvm.setCurrentCode(code);

        onCodeUpgrade(data);
    }

    function onCodeUpgrade(TvmCell _data) private {
        tvm.resetStorage();

        // TODO: add vault code and version after upgrade
        (
            platform_code,
            _accountCode,
            _accountVersion,
            _pairCodes,
            _pairVersions,
            _poolCodes,
            _poolVersions,
            _owner,
            /* _vault */,
            _pendingOwner
        ) = abi.decode(_data, (
            TvmCell,
            TvmCell,
            uint32,
            mapping(uint8 => TvmCell),
            mapping(uint8 => uint32),
            mapping(uint8 => TvmCell),
            mapping(uint8 => uint32),
            address,
            address,
            address
        ));

        _manager = address(0);

        _active = true;
    }

    // Reset balance to ROOT_INITIAL_BALANCE
    function resetGas(address receiver) override external view onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);

        receiver.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // VAULT

    function deployVault(
        address _tokenRoot,
        address _callbackRecipient,
        address _remainingGasTo
    ) override external onlyActive {
        require(msg.value >= DexGas.DEPLOY_VAULT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_tokenRoot.value != 0 && _tokenRoot != address(this), DexErrors.INVALID_ADDRESS);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        _deployVaultInternal(
            _tokenRoot,
            _callbackRecipient,
            _remainingGasTo
        );

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function _deployVaultInternal(
        address _tokenRoot,
        address _callbackRecipient,
        address _remainingGasTo
    ) internal {
        TvmCell data = _buildInitData(
            DexPlatformTypes.Vault,
            _buildTokenVaultParams(_tokenRoot)
        );

        address vault = new DexPlatform{
                stateInit: data,
                value: DexGas.DEPLOY_ACCOUNT_MIN_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                _vaultCode,
                _vaultVersion,
                _vault,
                _remainingGasTo
            );

        emit NewVaultCreated({
            vault: vault,
            tokenRoot: _tokenRoot,
            version: _vaultVersion,
            codeHash: tvm.hash(_vaultCode)
        });
    }

    function deployLpToken(
        address[] _tokenRoots,
        address _remainingGasTo
    ) override external onlyPool(_tokenRoots) {
        require(msg.value >= DexGas.DEPLOY_VAULT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        TvmCell data = _buildLpTokenPendingInitData(
            now,
            msg.sender,
            _tokenRoots,
            _lpTokenPendingCode
        );

        new DexVaultLpTokenPendingV2{
                stateInit: data,
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED
            }(
                _tokenFactory,
                msg.value,
                _remainingGasTo
            );
    }

    function onLiquidityTokenDeployed(
        uint32 _nonce,
        address _pair,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    ) external override {
        _deployVaultInternal(_lpRoot, address(this), _remainingGasTo);

        ILiquidityTokenRootDeployedCallback(_pair)
            .liquidityTokenRootDeployed{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_lpRoot, _remainingGasTo);
    }

    function onLiquidityTokenNotDeployed(
        uint32 _nonce,
        address _pair,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    ) external override {

    }

    function upgradeVault(
        address _tokenRoot,
        address _remainingGasTo
    )
        override
        external
        onlyManagerOrOwner
        onlyActive
    {
        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IUpgradableByRequest(_expectedTokenVaultAddress(_tokenRoot))
            .upgrade{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_vaultCode, _vaultVersion, _remainingGasTo);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // ACCOUNT

    function deployAccount(
        address account_owner,
        address send_gas_to
    ) override external onlyActive {
        require(msg.value >= DexGas.DEPLOY_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(account_owner.value != 0, DexErrors.INVALID_ADDRESS);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        new DexPlatform{
            stateInit: _buildInitData(
                DexPlatformTypes.Account,
                _buildAccountParams(account_owner)
            ),
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            _accountCode,
            _accountVersion,
            address(0),
            send_gas_to
        );
    }

    function requestUpgradeAccount(
        uint32 current_version,
        address send_gas_to,
        address account_owner
    ) override external onlyAccount(account_owner) {
        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        if (current_version == _accountVersion || !_active) {
            send_gas_to.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED
            });
        } else {
            IUpgradableByRequest(msg.sender)
                .upgrade{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (_accountCode, _accountVersion, send_gas_to);
        }
    }

    function forceUpgradeAccount(
        address account_owner,
        address send_gas_to
    ) external view onlyManagerOrOwner {
        require(msg.value >= DexGas.UPGRADE_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit RequestedForceAccountUpgrade(account_owner);

        IUpgradableByRequest(_expectedAccountAddress(account_owner))
            .upgrade{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_accountCode, _accountVersion, send_gas_to);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // PAIR/POOL

    function upgradePair(
        address left_root,
        address right_root,
        uint8 pool_type,
        address send_gas_to
    ) external view onlyManagerOrOwner {
        require(
            _pairVersions.exists(pool_type) &&
            _pairCodes.exists(pool_type),
            DexErrors.UNSUPPORTED_POOL_TYPE
        );
        require(msg.value >= DexGas.UPGRADE_PAIR_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit RequestedPoolUpgrade([left_root, right_root]);

        TvmCell code = _pairCodes[pool_type];
        uint32 version = _pairVersions[pool_type];

        IDexBasePool(_expectedPoolAddress([left_root, right_root]))
            .upgrade{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (code, version, pool_type, send_gas_to);
    }

    function upgradePool(
        address[] roots,
        uint8 pool_type,
        address send_gas_to
    ) external view onlyManagerOrOwner {
        require(
            _poolVersions.exists(pool_type) &&
            _poolCodes.exists(pool_type),
            DexErrors.UNSUPPORTED_POOL_TYPE
        );
        require(msg.value >= DexGas.UPGRADE_PAIR_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit RequestedPoolUpgrade(roots);

        TvmCell code = _poolCodes[pool_type];
        uint32 version = _poolVersions[pool_type];

        IDexBasePool(_expectedPoolAddress(roots))
            .upgrade{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (code, version, pool_type, send_gas_to);
    }

    function deployPair(
        address left_root,
        address right_root,
        address send_gas_to
    ) override external onlyActive {
        require(msg.value >= DexGas.DEPLOY_PAIR_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(left_root.value != right_root.value, DexErrors.WRONG_PAIR);
        require(left_root.value != 0, DexErrors.WRONG_PAIR);
        require(right_root.value != 0, DexErrors.WRONG_PAIR);

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        _deployVaultInternal(left_root, address(this), send_gas_to);
        _deployVaultInternal(right_root, address(this), send_gas_to);

        new DexPlatform{
            stateInit: _buildInitData(
                DexPlatformTypes.Pool,
                _buildPairParams([left_root, right_root])
            ),
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            _pairCodes[DexPoolTypes.CONSTANT_PRODUCT],
            _pairVersions[DexPoolTypes.CONSTANT_PRODUCT],
            address(0),
            send_gas_to
        );
    }

    function deployStablePool(
        address[] roots,
        address send_gas_to
    ) override external onlyManagerOrOwner {
        require(msg.value >= DexGas.DEPLOY_PAIR_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_poolCodes.exists(DexPoolTypes.STABLE_POOL), DexErrors.PAIR_CODE_EMPTY);

        mapping(address => bool) _roots;
        for (uint i = 0; i < roots.length; i++) {
            require(roots[i].value != 0, DexErrors.WRONG_PAIR);
            require(_roots[roots[i]] != true, DexErrors.WRONG_PAIR);

            _roots[roots[i]] = true;
        }

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        new DexPlatform{
            stateInit: _buildInitData(
                DexPlatformTypes.Pool,
                _buildPairParams(roots)
            ),
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            _poolCodes[DexPoolTypes.STABLE_POOL],
            _poolVersions[DexPoolTypes.STABLE_POOL],
            address(0),
            send_gas_to
        );
    }

    function setPairFeeParams(
        address[] _roots,
        FeeParams _params,
        address _remainingGasTo
    ) override external view onlyManagerOrOwner {
        require(
            _params.denominator != 0 &&
            (_params.pool_numerator + _params.beneficiary_numerator + _params.referrer_numerator) < _params.denominator &&
            (_params.pool_numerator + _params.beneficiary_numerator) > 0 &&
            ((_params.beneficiary.value != 0 && _params.beneficiary_numerator != 0) ||
            (_params.beneficiary.value == 0 && _params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS
        );

        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IDexBasePool(_expectedPoolAddress(_roots))
            .setFeeParams{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_params, _remainingGasTo);
    }

    function setPairAmplificationCoefficient(
        address[] _roots,
        AmplificationCoefficient _A,
        address _remainingGasTo
    ) external view onlyManagerOrOwner {
        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IDexStablePair(_expectedPoolAddress(_roots))
            .setAmplificationCoefficient{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_A, _remainingGasTo);
    }

    function resetTargetGas(
        address target,
        address receiver
    ) external view onlyOwner {
        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IResetGas(target)
            .resetGas{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (receiver);
    }

    function onPoolCreated(
        address[] _roots,
        uint8 _poolType,
        address _remainingGasTo
    ) override external onlyPool(_roots) {
        tvm.rawReserve(
            math.max(
                DexGas.ROOT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit NewPoolCreated(_roots, _poolType);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function setOracleOptions(
        address _leftRoot,
        address _rightRoot,
        OracleOptions _options,
        address _remainingGasTo
    ) override external view onlyManagerOrOwner {
        tvm.rawReserve(math.max(DexGas.ROOT_INITIAL_BALANCE, address(this).balance - msg.value), 2);

        IDexConstantProductPair(_expectedPoolAddress([_leftRoot, _rightRoot]))
            .setOracleOptions{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_options, _remainingGasTo);
    }

    function removeLastNPoints(
        address _leftRoot,
        address _rightRoot,
        uint16 _count,
        address _remainingGasTo
    ) override external view onlyManagerOrOwner {
        tvm.rawReserve(math.max(DexGas.ROOT_INITIAL_BALANCE, address(this).balance - msg.value), 2);

        IDexConstantProductPair(_expectedPoolAddress([_leftRoot, _rightRoot]))
            .removeLastNPoints{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_count, _remainingGasTo);
    }
}
