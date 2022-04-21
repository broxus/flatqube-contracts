pragma ton-solidity >=0.57.0;

interface ILimitOrderFactory {
    
    event RequestedOwnerTransfer(
        address oldOwner, 
        address newOwner
    );
    
    event OwnerTransferAccepted(
        address oldOwner,
        address newOwner
    );
   
    event LimitOrderRootCodeUpgraded();
    event LimitOrderCodeUpgraded();
    event LimitOrderCodeClosedUpgraded();
    event CreateLimitOrderRoot(
        address limitOrdersRoot,
        address tokenRoot
    );

    event LimitOrderFactoryUpgrade();

    function createLimitOrdersRoot(
        address tokenRoot
    ) external view;

    function expectedAddressLimitOrderRoots(
        address tokenRoot
    ) external view responsible returns (address);

    function onLimitOrdersRootDeployed(
        address limitOrderRoot,
        address tokenRoot,
        address sendGasTo
    ) external;

    function upgrade(
        TvmCell newCode, 
        uint32 newVersion,
        address sendGasTo
    ) external;
}
