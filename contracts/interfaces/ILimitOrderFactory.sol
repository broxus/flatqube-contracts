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
   
    event LimitOrderRootCodeUpgraded(uint32 _versionLimitOrderRoot);
    event LimitOrderCodeUpgraded();
    event LimitOrderCodeClosedUpgraded();
    event LimitOrderCodePlatformUpgraded();

    event CreateLimitOrderRoot(
        address limitOrderRoot,
        address tokenRoot
    );

    event LimitOrderFactoryUpgrade();

    function createLimitOrderRoot(
        address tokenRoot
    ) external view;

    function getExpectedAddressLimitOrderRoot(address tokenRoot)
		external
		view
		responsible
		returns (address);

    function onLimitOrderRootDeployed(
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
