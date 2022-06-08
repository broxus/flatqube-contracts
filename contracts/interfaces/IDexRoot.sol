pragma ton-solidity >= 0.57.0;

import "../structures/IFeeParams.sol";

interface IDexRoot is IFeeParams {
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
}
