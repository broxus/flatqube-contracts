pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "./abstract/DexContractBase.sol";

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

import "./DexPlatform.sol";

contract DexRoot is DexContractBase, IDexRoot {
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

    address private _tokenFactory;
    bool private _active;

    address private _owner;
    address private _vault;
    address private _pendingOwner;
    address private _manager;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // MODIFIERS

    modifier reserve(uint128 _reserve) {
        tvm.rawReserve(
            math.max(
                _reserve,
                address(this).balance - msg.value
            ),
            0
        );
        _;
    }

    modifier onlyManagerOrOwner() {
        require(
            msg.sender.value != 0 &&
            (msg.sender == _owner || msg.sender == _manager),
            DexErrors.NOT_MY_OWNER
        );
        _;
    }

    modifier onlyManagerOwnerOrSelf() {
        require(
            msg.sender.value != 0 &&
            (msg.sender == _owner || msg.sender == _manager || msg.sender == address(this)),
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

    constructor(address initial_owner, address initial_vault) public {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 0);
        tvm.accept();

        _owner = initial_owner;
        _vault = initial_vault;

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

    function getVault() override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _vault;
    }

    function getTokenVaultCode() override external view responsible returns (TvmCell) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _vaultCode;
    }

    function getTokenVaultVersion() override external view responsible returns (uint32) {
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

    function getOwner() override external view responsible returns (address dex_owner) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _owner;
    }

    function getPendingOwner() override external view responsible returns (address dex_pending_owner) {
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

    function getManager() external view override responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _manager;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // SETTERS

    function setVaultOnce(address new_vault)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        require(_vault.value == 0, DexErrors.VAULT_ALREADY_SET);

        _vault = new_vault;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function setActive(bool new_active)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        if (
            new_active &&
            !platform_code.toSlice().empty() &&
            _vault.value != 0 &&
            _tokenFactory.value != 0 &&
            _vaultVersion > 0 &&
            _lpTokenPendingVersion > 0 &&
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

    function setManager(address _newManager)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        _manager = _newManager;

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }

    function revokeManager()
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        _manager = address(0);

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }

    function transferOwner(address new_owner)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        emit RequestedOwnerTransfer(_owner, new_owner);

        _pendingOwner = new_owner;
    }

    function acceptOwner()
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
    {
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
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        address previous = _tokenFactory;
        _tokenFactory = _newTokenFactory;

        emit TokenFactoryUpdated({
            current: _newTokenFactory,
            previous: previous
        });

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // INSTALL CODE

    function installPlatformOnce(TvmCell code)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        // can be installed only once
        require(platform_code.toSlice().empty(), DexErrors.PLATFORM_CODE_NON_EMPTY);

        platform_code = code;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdateAccountCode(TvmCell code)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
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
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
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
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        _poolCodes[pool_type] = code;
        _poolVersions[pool_type]++;

        emit PoolCodeUpgraded(_poolVersions[pool_type], pool_type);

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        });
    }

    function installOrUpdateTokenVaultCode(
        TvmCell _newCode,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(!_newCode.toSlice().empty(), DexErrors.VAULT_CODE_EMPTY);

        _vaultCode = _newCode;
        _vaultVersion += 1;

        emit TokenVaultCodeUpgraded({
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
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(!_newCode.toSlice().empty(), DexErrors.LP_TOKEN_PENDING_CODE_EMPTY);

        _lpTokenPendingCode = _newCode;
        _lpTokenPendingVersion += 1;

        emit LpTokenPendingCodeUpgraded({
            version: _lpTokenPendingVersion,
            codeHash: tvm.hash(_newCode)
        });

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // INTERNAL

    function upgrade(TvmCell code)
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        require(msg.value > DexGas.UPGRADE_ROOT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

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
            _vault,
            _vaultCode,
            _vaultVersion,
            _lpTokenPendingCode,
            _lpTokenPendingVersion,
            _tokenFactory,
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
            _vault,
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
    function resetGas(address receiver)
        external
        view
        override
        onlyOwner
    {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 0);

        receiver.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // VAULT

    function deployTokenVault(
        address _tokenRoot,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyActive
    {
        require(msg.value >= DexGas.DEPLOY_VAULT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_tokenRoot.value != 0 && _tokenRoot != address(this), DexErrors.WRONG_TOKEN_ROOT);

        _deployVaultInternal(
            _tokenRoot,
            _remainingGasTo
        );

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function onTokenVaultDeployed(
        uint32 _version,
        address _tokenRoot,
        address _tokenWallet,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyTokenVault(_tokenRoot)
    {
        emit NewTokenVaultCreated({
            vault: msg.sender,
            tokenRoot: _tokenRoot,
            tokenWallet: _tokenWallet,
            version: _version
        });

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function _deployVaultInternal(
        address _tokenRoot,
        address _remainingGasTo
    ) private view {
        TvmCell data = _buildInitData(
            DexPlatformTypes.Vault,
            _buildTokenVaultParams(_tokenRoot)
        );

        new DexPlatform{
            stateInit: data,
            value: DexGas.DEPLOY_VAULT_MIN_VALUE,
            flag: 0
        }(
            _vaultCode,
            _vaultVersion,
            _vault,
            _remainingGasTo
        );
    }

    function deployLpToken(
        address[] _tokenRoots,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyPool(_tokenRoots)
    {
        require(msg.value >= DexGas.DEPLOY_LP_TOKEN_ROOT_VALUE, DexErrors.VALUE_TOO_LOW);

        TvmCell data = _buildLpTokenPendingInitData(
            now,
            msg.sender,
            _tokenRoots,
            _lpTokenPendingCode
        );

        new DexVaultLpTokenPendingV2{
            stateInit: data,
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        }(_tokenFactory, _remainingGasTo);
    }

    function onLiquidityTokenDeployed(
        uint32 _lpPendingNonce,
        address _pool,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyLpTokenPending(
            _lpPendingNonce,
            _pool,
            _roots,
            _lpTokenPendingCode
        )
    {
        emit NewLpTokenRootCreated({
            pool: _pool,
            poolTokenRoots: _roots,
            lpTokenRoot: _lpRoot,
            lpPendingNonce: _lpPendingNonce
        });

        _deployVaultInternal(_lpRoot, _remainingGasTo);

        ILiquidityTokenRootDeployedCallback(_pool)
            .liquidityTokenRootDeployed{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_lpRoot, _remainingGasTo);
    }

    function onLiquidityTokenNotDeployed(
        uint32 _lpPendingNonce,
        address _pool,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyLpTokenPending(
            _lpPendingNonce,
            _pool,
            _roots,
            _lpTokenPendingCode
        )
    {
        ILiquidityTokenRootNotDeployedCallback(_pool)
            .liquidityTokenRootNotDeployed{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_lpRoot, _remainingGasTo);
    }

    function upgradeTokenVault(
        address _tokenRoot,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        _upgradeVaultInternal(_tokenRoot, _remainingGasTo);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    function upgradeTokenVaults(
        address[] _tokenRoots,
        uint32 _offset,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOwnerOrSelf
    {
        uint length = _tokenRoots.length;

        uint takeUntil = math.min(_offset + 5, length);

        for (uint i = _offset; i < takeUntil; i++) {
            _upgradeVaultInternal(_tokenRoots[i], _remainingGasTo);
        }

        if (takeUntil < length) {
            IDexRoot(address(this))
                .upgradeTokenVaults{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED,
                    bounce: false
                }(_tokenRoots, uint32(takeUntil), _remainingGasTo);
        } else {
            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            });
        }
    }

    function _upgradeVaultInternal(
        address _tokenRoot,
        address _remainingGasTo
    ) private view {
        address vault = _expectedTokenVaultAddress(_tokenRoot);

        IUpgradableByRequest(vault)
            .upgrade{
                value: DexGas.UPGRADE_TOKEN_VAULT_MIN_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(_vaultCode, _vaultVersion, _remainingGasTo);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // ACCOUNT

    function deployAccount(
        address account_owner,
        address send_gas_to
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyActive
    {
        require(msg.value >= DexGas.DEPLOY_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(account_owner.value != 0, DexErrors.INVALID_ADDRESS);

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
            _vault,
            send_gas_to
        );
    }

    function requestUpgradeAccount(
        uint32 current_version,
        address send_gas_to,
        address account_owner
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyAccount(account_owner)
    {
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
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(msg.value >= DexGas.UPGRADE_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        _upgradeAccountInternal(
            account_owner,
            send_gas_to
        );

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function upgradeAccounts(
        address[] _accountsOwners,
        uint32 _offset,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOwnerOrSelf
    {
        uint length = _accountsOwners.length;

        uint takeUntil = math.min(_offset + 5, length);

        for (uint i = _offset; i < takeUntil; i++) {
            _upgradeAccountInternal(_accountsOwners[i], _remainingGasTo);
        }

        if (takeUntil < length) {
            IDexRoot(address(this))
                .upgradeAccounts{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED,
                    bounce: false
                }(_accountsOwners, uint32(_offset), _remainingGasTo);
        } else {
            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            });
        }
    }

    function _upgradeAccountInternal(
        address _accountOwner,
        address _remainingGasTo
    )
        private
        view
    {
        emit RequestedForceAccountUpgrade(_accountOwner);

        IUpgradableByRequest(_expectedAccountAddress(_accountOwner))
            .upgrade{ value: DexGas.UPGRADE_ACCOUNT_MIN_VALUE, flag: MsgFlag.SENDER_PAYS_FEES }
            (_accountCode, _accountVersion, _remainingGasTo);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // PAIR/POOL

    function upgradePair(
        address left_root,
        address right_root,
        uint8 pool_type,
        address send_gas_to
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(msg.value >= DexGas.UPGRADE_POOL_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        _upgradePairInternal(
            PairUpgradeParam({
                tokenRoots: [left_root, right_root],
                poolType: pool_type
            }),
            send_gas_to
        );

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function upgradePool(
        address[] roots,
        uint8 pool_type,
        address send_gas_to
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(
            _poolVersions.exists(pool_type) &&
            _poolCodes.exists(pool_type),
            DexErrors.UNSUPPORTED_POOL_TYPE
        );
        require(msg.value >= DexGas.UPGRADE_POOL_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        emit RequestedPoolUpgrade(roots);

        TvmCell code = _poolCodes[pool_type];
        uint32 version = _poolVersions[pool_type];

        IDexBasePool(_expectedPoolAddress(roots))
            .upgrade{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (code, version, pool_type, send_gas_to);
    }

    function upgradePairs(
        PairUpgradeParam[] _params,
        uint32 _offset,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOwnerOrSelf
    {
        uint length = _params.length;

        uint takeUntil = math.min(_offset + 5, length);

        for (uint i = _offset; i < takeUntil; i++) {
            _upgradePairInternal(_params[i], _remainingGasTo);
        }

        if (takeUntil < length) {
            IDexRoot(address(this))
                .upgradePairs{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED,
                    bounce: false
                }(_params, uint32(takeUntil), _remainingGasTo);
        } else {
            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            });
        }
    }

    function _upgradePairInternal(
        PairUpgradeParam _param,
        address _remainingGasTo
    ) private view {
        require(
            _pairVersions.exists(_param.poolType) &&
            _pairCodes.exists(_param.poolType),
            DexErrors.UNSUPPORTED_POOL_TYPE
        );

        emit RequestedPoolUpgrade(_param.tokenRoots);

        TvmCell code = _pairCodes[_param.poolType];
        uint32 version = _pairVersions[_param.poolType];

        IDexBasePool(_expectedPoolAddress(_param.tokenRoots))
            .upgrade{
                value: DexGas.UPGRADE_POOL_MIN_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(code, version, _param.poolType, _remainingGasTo);
    }

    function setPoolActive(
        PoolActiveParam _param,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        _setPoolActiveInternal(_param, _remainingGasTo);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    function setPoolsActive(
        PoolActiveParam[] _params,
        uint32 _offset,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOwnerOrSelf
    {
        uint length = _params.length;

        uint takeUntil = math.min(_offset + 5, length);

        for (uint i = _offset; i < takeUntil; i++) {
            _setPoolActiveInternal(_params[i], _remainingGasTo);
        }

        if (takeUntil < length) {
            IDexRoot(address(this))
                .setPoolsActive{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED,
                    bounce: false
                }(_params, uint32(takeUntil), _remainingGasTo);
        } else {
            _remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            });
        }
    }

    function _setPoolActiveInternal(
        PoolActiveParam _param,
        address _remainingGasTo
    ) private view {
        IDexBasePool(_expectedPoolAddress(_param.tokenRoots))
            .setActive{
                value: DexGas.SET_POOL_ACTIVE_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(_param.newActive, _remainingGasTo);
    }

    function deployPair(
        address left_root,
        address right_root,
        address send_gas_to
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyActive
    {
        require(
            msg.value >=  (
                DexGas.DEPLOY_POOL_BASE_VALUE +
                3 * (DexGas.DEPLOY_VAULT_MIN_VALUE + 0.1 ever)
            ),
            DexErrors.VALUE_TOO_LOW
        );
        require(left_root.value != right_root.value, DexErrors.WRONG_PAIR);
        require(left_root.value != 0, DexErrors.WRONG_PAIR);
        require(right_root.value != 0, DexErrors.WRONG_PAIR);

        _deployVaultInternal(left_root, send_gas_to);
        _deployVaultInternal(right_root, send_gas_to);

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
            _vault,
            send_gas_to
        );
    }

    function deployStablePool(
        address[] roots,
        address send_gas_to
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        uint256 rootsCount = roots.length;
        require(
            msg.value >=  (
                DexGas.DEPLOY_POOL_BASE_VALUE +
                (rootsCount + 1) * (DexGas.DEPLOY_VAULT_MIN_VALUE + 0.1 ever)
            ),
            DexErrors.VALUE_TOO_LOW
        );
        require(_poolCodes.exists(DexPoolTypes.STABLE_POOL), DexErrors.PAIR_CODE_EMPTY);

        mapping(address => bool) _roots;
        for (uint i = 0; i < rootsCount; i++) {
            require(roots[i].value != 0, DexErrors.WRONG_PAIR);
            require(_roots[roots[i]] != true, DexErrors.WRONG_PAIR);

            _roots[roots[i]] = true;
        }

        for (address root: roots) {
            _deployVaultInternal(root, send_gas_to);
        }

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
            _vault,
            send_gas_to
        );
    }

    function setPairFeeParams(
        address[] _roots,
        FeeParams _params,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        require(
            _params.denominator != 0 &&
            (_params.pool_numerator + _params.beneficiary_numerator + _params.referrer_numerator) < _params.denominator &&
            (_params.pool_numerator + _params.beneficiary_numerator) > 0 &&
            ((_params.beneficiary.value != 0 && _params.beneficiary_numerator != 0) ||
            (_params.beneficiary.value == 0 && _params.beneficiary_numerator == 0)),
            DexErrors.WRONG_FEE_PARAMS
        );

        IDexBasePool(_expectedPoolAddress(_roots))
            .setFeeParams{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_params, _remainingGasTo);
    }

    function setPairAmplificationCoefficient(
        address[] _roots,
        AmplificationCoefficient _A,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        IDexStablePair(_expectedPoolAddress(_roots))
            .setAmplificationCoefficient{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_A, _remainingGasTo);
    }

    function resetTargetGas(
        address target,
        address receiver
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyOwner
    {
        IResetGas(target)
            .resetGas{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (receiver);
    }

    function onPoolCreated(
        address[] _roots,
        uint8 _poolType,
        address _remainingGasTo
    )
        external
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyPool(_roots)
    {
        emit NewPoolCreated(_roots, _poolType);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function setOracleOptions(
        address _leftRoot,
        address _rightRoot,
        OracleOptions _options,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        IDexConstantProductPair(_expectedPoolAddress([_leftRoot, _rightRoot]))
            .setOracleOptions{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_options, _remainingGasTo);
    }

    function removeLastNPoints(
        address _leftRoot,
        address _rightRoot,
        uint16 _count,
        address _remainingGasTo
    )
        external
        view
        override
        reserve(DexGas.ROOT_INITIAL_BALANCE)
        onlyManagerOrOwner
    {
        IDexConstantProductPair(_expectedPoolAddress([_leftRoot, _rightRoot]))
            .removeLastNPoints{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_count, _remainingGasTo);
    }
}
