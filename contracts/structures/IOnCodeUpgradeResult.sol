pragma ton-solidity >= 0.57.0;

interface IOnCodeUpgradeResult {
    struct OnCodeUpgradeResult {
        address _factory;
        address _spentToken;
        uint32 oldVersion;
        uint32 newVersion;
        address _deployer;
    }
}