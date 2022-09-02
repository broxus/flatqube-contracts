pragma ton-solidity >= 0.57.0;

import "../structures/IFeeParams.sol";
import "../structures/IOracleOptions.sol";

interface IDexRoot is IFeeParams, IOracleOptions {
    event AccountCodeUpgraded(uint32 version);
    event PairCodeUpgraded(uint32 version, uint8 pool_type);
    event RootCodeUpgraded();
    event ActiveUpdated(bool new_active);

    event RequestedPairUpgrade(address left_root, address right_root);
    event RequestedForceAccountUpgrade(address account_owner);

    event RequestedOwnerTransfer(address old_owner, address new_owner);
    event OwnerTransferAccepted(address old_owner, address new_owner);

    event NewPairCreated(address left_root, address right_root);

    function requestUpgradeAccount(uint32 current_version, address send_gas_to, address owner) external;
    function onPairCreated(address left_root, address right_root, address send_gas_to) external;

    function deployPair(address left_root, address right_root, address send_gas_to) external;
    function deployAccount(address account_owner, address send_gas_to) external;

    function getExpectedPairAddress(address left_root, address right_root) external view responsible returns (address);
    function getExpectedAccountAddress(address account_owner) external view responsible returns (address);

    function getAccountVersion() external view responsible returns (uint32);
    function getAccountCode() external view responsible returns (TvmCell);
    function getPairVersion(uint8 pool_type) external view responsible returns (uint32);
    function getPairCode(uint8 pool_type) external view responsible returns (TvmCell);

    function isActive() external view responsible returns (bool);
    function getVault() external view responsible returns (address);

    function setPairFeeParams(
        address left_root,
        address right_root,
        FeeParams params,
        address send_gas_to
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
