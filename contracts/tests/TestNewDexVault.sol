pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "../libraries/DexErrors.sol";
import "../libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

// This is just for test purposes, this is not a real contract!
contract NewDexVault {
    uint32 private static _nonce;

    TvmCell public platform_code;

    TvmCell private _lpTokenPendingCode;

    address private _root;
    address private _owner;
    address private _pendingOwner;

    address private _tokenFactory;

    mapping(address => bool) public _lpVaultWallets;

    // referral program
    uint256 private _projectId;
    address private _projectAddress;
    address private _refSystemAddress;

    string newTestField;

    constructor() public {revert();}

    function getOwner() external view responsible returns (address) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } _owner;
    }

    function getPendingOwner() external view responsible returns (address) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } _pendingOwner;
    }

    function getLpTokenPendingCode() external view responsible returns (TvmCell) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } _lpTokenPendingCode;
    }

    function getTokenFactory() external view responsible returns (address) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } _tokenFactory;
    }

    function getRoot() external view responsible returns (address) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } _root;
    }

    function getReferralProgramParams() external view responsible returns (uint256, address, address) {
        return {
        value: 0,
        bounce: false,
        flag: MsgFlag.REMAINING_GAS
        } (_projectId, _projectAddress, _refSystemAddress);
    }

    function onCodeUpgrade(TvmCell _data) private {
        tvm.resetStorage();

        TvmSlice slice = _data.toSlice();

        (_root, _tokenFactory) = slice.decode(address, address);

        TvmCell ownersData = slice.loadRef();
        TvmSlice ownersSlice = ownersData.toSlice();
        (_owner, _pendingOwner) = ownersSlice.decode(address, address);

        platform_code = slice.loadRef();
        _lpTokenPendingCode = slice.loadRef();

        if (slice.refs() >= 1) {
            (_lpVaultWallets, _projectId, _projectAddress, _refSystemAddress)  = abi.decode(slice.loadRef(), (mapping(address => bool), uint256, address, address));
        }

        newTestField = "New Vault";

        // Refund remaining gas
        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function newFunc() public view returns (string) {
        return newTestField;
    }
}
