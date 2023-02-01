pragma ton-solidity >= 0.62.0;

import "../structures/IFeeParams.sol";
import "../structures/IOracleOptions.sol";

interface IDexRoot is IFeeParams, IOracleOptions {
    event AccountCodeUpgraded(uint32 version);

    event PairCodeUpgraded(
        uint32 version,
        uint8 poolType
    );

    event PoolCodeUpgraded(
        uint32 version,
        uint8 poolType
    );

    event VaultCodeUpgraded(
        uint32 version,
        uint codeHash
    );

    event RootCodeUpgraded();

    event ActiveUpdated(bool newActive);

    event RequestedPoolUpgrade(address[] roots);

    event RequestedForceAccountUpgrade(address accountOwner);

    event RequestedOwnerTransfer(
        address oldOwner,
        address newOwner
    );

    event OwnerTransferAccepted(
        address oldOwner,
        address newOwner
    );

    event NewPoolCreated(
        address[] roots,
        uint8 poolType
    );

    event NewVaultCreated(
        address vault,
        address tokenRoot,
        uint32 version,
        uint codeHash
    );

    function getAccountVersion() external view responsible returns (uint32);

    function getAccountCode() external view responsible returns (TvmCell);

    function getPairVersion(uint8 _poolType) external view responsible returns (uint32);

    function getPairCode(uint8 _poolType) external view responsible returns (TvmCell);

    function getPoolVersion(uint8 _poolType) external view responsible returns (uint32);

    function getPoolCode(uint8 _poolType) external view responsible returns (TvmCell);

    function isActive() external view responsible returns (bool);

    function getVaultCode() external view responsible returns (TvmCell);

    function getVaultVersion() external view responsible returns (uint32);

    function getExpectedTokenVaultAddress(address _tokenRoot) external view responsible returns (address);

    function getTokenFactory() external view responsible returns (address);

    function getLpTokenPendingCode() external view responsible returns (TvmCell);

    function getLpTokenPendingVersion() external view responsible returns (uint32);

    function getExpectedPairAddress(
        address left_root,
        address right_root
    ) external view responsible returns (address);

    function getExpectedPoolAddress(address[] _roots) external view responsible returns (address);

    function getExpectedAccountAddress(address account_owner) external view responsible returns (address);

    function setTokenFactory(
        address _newTokenFactory,
        address _remainingGasTo
    ) external;

    function installOrUpdateVaultCode(
        TvmCell _newCode,
        address _remainingGasTo
    ) external;

    function installOrUpdateLpTokenPendingCode(
        TvmCell _newCode,
        address _remainingGasTo
    ) external;

    function deployLpToken(
        address[] _tokenRoots,
        address _remainingGasTo
    ) external;

    function deployVault(
        address _tokenRoot,
        address _callbackRecipient,
        address _remainingGasTo
    ) external;

    function upgradeVault(
        address _tokenRoot,
        address _remainingGasTo
    ) external;

    function onLiquidityTokenDeployed(
        uint32 _nonce,
        address _pair,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    ) external;

    function onLiquidityTokenNotDeployed(
        uint32 _nonce,
        address _pair,
        address[] _roots,
        address _lpRoot,
        address _remainingGasTo
    ) external;

    function deployAccount(
        address account_owner,
        address send_gas_to
    ) external;

    function requestUpgradeAccount(
        uint32 _currentVersion,
        address _remainingGasTo,
        address _owner
    ) external;

    function deployPair(
        address left_root,
        address right_root,
        address send_gas_to
    ) external;

    function deployStablePool(
        address[] roots,
        address send_gas_to
    ) external;

    function onPoolCreated(
        address[] _roots,
        uint8 _poolType,
        address _remainingGasTo
    ) external;

    function setPairFeeParams(
        address[] _roots,
        FeeParams _params,
        address _remainingGasTo
    ) external view;

    /// @notice Proxy for TWAPOracle's setOracleOptions
    /// @param _leftRoot Address of the left TokenRoot
    /// @param _rightRoot Address of the right TokenRoot
    /// @param _options New oracle's options
    /// @param _remainingGasTo Recipient of the remaining gas
    function setOracleOptions(
        address _leftRoot,
        address _rightRoot,
        OracleOptions _options,
        address _remainingGasTo
    ) external view;

    /// @notice Proxy for TWAPOracle's removeLastNPoints
    /// @param _leftRoot Address of the left TokenRoot
    /// @param _rightRoot Address of the right TokenRoot
    /// @param _count Count of last points to remove
    /// @param _remainingGasTo Recipient of the remaining gas
    function removeLastNPoints(
        address _leftRoot,
        address _rightRoot,
        uint16 _count,
        address _remainingGasTo
    ) external view;
}
