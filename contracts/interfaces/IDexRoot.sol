pragma ton-solidity >= 0.57.0;

import "../structures/IFeeParams.sol";

interface IDexRoot is IFeeParams {
    event AccountCodeUpgraded(uint32 version);

    event PairCodeUpgraded(
        uint32 version,
        uint8 poolType
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

    event NewPoolCreated(address[] roots);

    function getAccountVersion() external view responsible returns (uint32);

    function getAccountCode() external view responsible returns (TvmCell);

    function getPairVersion(uint8 _poolType) external view responsible returns (uint32);

    function getPairCode(uint8 _poolType) external view responsible returns (TvmCell);

    function isActive() external view responsible returns (bool);

    function getVault() external view responsible returns (address);

    function getExpectedPairAddress(
        address left_root,
        address right_root
    ) external view responsible returns (address);

    function getExpectedPoolAddress(address[] _roots) external view responsible returns (address);

    function getExpectedAccountAddress(address account_owner) external view responsible returns (address);

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

    function onPoolCreated(
        address[] _roots,
        address _remainingGasTo
    ) external;

    function setPairFeeParams(
        address[] _roots,
        FeeParams _params,
        address _remainingGasTo
    ) external view;
}
