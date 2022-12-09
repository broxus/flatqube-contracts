pragma ton-solidity >= 0.57.0;

interface IOnOrderRootCreateResult {
    struct OnOrderRootCreateResult {
        address _factory;
        address _spentToken;
        uint32 oldVersion;
        uint32 newVersion;
        address _deployer;
    }
}