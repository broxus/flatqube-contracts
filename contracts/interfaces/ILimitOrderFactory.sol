pragma ton-solidity >=0.57.0;

interface ILimitOrderFactory {
    event RequestedOwnerTransfer(address oldOwner, address newOwner);
    event OwnerTransferAccepted(address oldOwner, address newOwner);
    event LimitOrderRootCodeUpgraded();
    event LimitOrderCodeUpgraded();
    event CreateLimitOrderRoot(address limitOrderRoot, address tokenRoot);

    function onLimitOrderRootDeployed(
        address limitOrderRoot,
        address tokenRoot,
        address sendGasTo
    ) external;
}
