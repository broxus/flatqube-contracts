pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "../libraries/DexErrors.sol";
import "../libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

// This is just for test purposes, this is not a real contract!
contract NewDexRoot {
    uint32 static _nonce;

    TvmCell public platform_code;
    TvmCell public account_code;
    uint32 account_version;
    mapping(uint8 => TvmCell) pair_codes;
    mapping(uint8 => uint32) pair_versions;
    mapping(uint8 => TvmCell) pool_codes;
    mapping(uint8 => uint32) pool_versions;


    bool active;

    address owner;
    address vault;
    address pending_owner;

    string newTestField;

    constructor() public {revert();}

    function getOwner() external view responsible returns (address dex_owner) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } owner;
    }

    function getPendingOwner() external view responsible returns (address dex_pending_owner) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pending_owner;
    }

    function getAccountVersion() external view responsible returns (uint32) {
        return{ value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } account_version;
    }
    function getPairVersion(uint8 pool_type)  external view responsible returns (uint32) {
        require(pair_versions.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);
        return{ value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pair_versions[pool_type];
    }

    function getPairCode(uint8 pool_type)  external view responsible returns (TvmCell) {
        require(pair_codes.exists(pool_type), DexErrors.UNSUPPORTED_POOL_TYPE);
        return{ value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pair_codes[pool_type];
    }

    function getAccountCode()  external view responsible returns (TvmCell) {
        return{ value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } account_code;
    }

    function setActive(bool new_active) external {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 2);
        if (
            new_active &&
            !platform_code.toSlice().empty() &&
            vault.value != 0 &&
            account_version > 0 &&
            !pair_versions.empty()
        ) {
            active = true;
        } else {
            active = false;
        }
        owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function isActive() external view responsible returns (bool) {
        return {value : 0, bounce : false, flag : MsgFlag.REMAINING_GAS} active;
    }

    function onCodeUpgrade(TvmCell data) private {
        tvm.resetStorage();

        (
            platform_code,
            account_code,
            account_version,
            pair_codes,
            pair_versions,
            pool_codes,
            pool_versions,
            owner,
            vault,
            pending_owner
        ) = abi.decode(data, (
            TvmCell,
            TvmCell,
            uint32,
            mapping(uint8 => TvmCell),
            mapping(uint8 => uint32),
            mapping(uint8 => TvmCell),
            mapping(uint8 => uint32),
            address,
            address,
            address
        ));

        active = true;

        newTestField = "New Root";

        owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function newFunc() public view returns (string) {
        return newTestField;
    }
}
