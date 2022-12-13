pragma ton-solidity >= 0.57.0;

interface IOnOrderRootCreateResult {
    struct OnOrderRootCreateResult {
        address factory;
        address spentToken;
        uint32 oldVersion;
        uint32 newVersion;
        address deployer;
    }
}