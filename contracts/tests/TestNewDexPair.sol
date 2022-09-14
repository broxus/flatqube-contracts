pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "../libraries/DexErrors.sol";
import "../libraries/DexGas.sol";
import "../libraries/FixedPoint128.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "../interfaces/IDexPair.sol";
import "../structures/ITokenOperationStructure.sol";
import "../structures/IPoint.sol";
import "../structures/IOracleOptions.sol";

// This is just for test purposes, this is not a real contract!
contract TestNewDexPair is ITokenOperationStructure, IFeeParams, IPoint, IOracleOptions {
    address root;
    address vault;
    uint32 current_version;
    TvmCell public platform_code;

    // Params:
    address left_root;
    address right_root;

    // Custom:
    bool active;
    // Wallets
    address public lp_wallet;
    address public left_wallet;
    address public right_wallet;
    // Vault wallets
    address public vault_left_wallet;
    address public vault_right_wallet;
    // Liquidity tokens
    address public lp_root;
    uint128 public lp_supply;
    // Balances
    uint128 public left_balance;
    uint128 public right_balance;
    // Fee
    FeeParams fee;

    // v2
    uint64 _nonce;
    mapping(uint64 => TokenOperation) _tmp_operations;
    mapping(uint64 => address) _tmp_send_gas_to;
    mapping(uint64 => address) _tmp_expected_callback_sender;
    mapping(uint64 => uint256) _tmp_sender_public_key;
    mapping(uint64 => address) _tmp_sender_address;

    // Oracle
    mapping(uint32 => Point) private _points;
    OracleOptions private _options;
    uint16 private _length;

    string newTestField;

    constructor() public {revert();}

    function getRoot() external view responsible returns (address dex_root) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } root;
    }

    function getTokenRoots() external view responsible returns (address left, address right, address lp) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_root, right_root, lp_root);
    }

    function getTokenWallets() external view responsible returns (address left, address right, address lp) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (left_wallet, right_wallet, lp_wallet);
    }

    function getVersion() external view responsible returns (uint32 version) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } current_version;
    }

    function getPoolType() external view responsible returns (uint8) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } 1;
    }

    function getVault() external view responsible returns (address dex_vault) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } vault;
    }

    function getVaultWallets() external view responsible returns (address left, address right) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } (vault_left_wallet, vault_right_wallet);
    }

    function getFeeParams() external view responsible returns (FeeParams) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } fee;
    }

    function isActive() external view responsible returns (bool) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } active;
    }

    function getBalances() external view responsible returns (IDexPair.IDexPairBalances) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } IDexPair.IDexPairBalances(
            lp_supply,
            left_balance,
            right_balance
        );
    }

    function getPoint(uint32 _timestamp) external view responsible returns (Point) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _points[_timestamp];
    }

    function getCardinality() external view responsible returns (uint16) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _options.cardinality;
    }

    function getLength() external view responsible returns (uint16) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _length;
    }

    function getMinInterval() external view responsible returns (uint8) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _options.minInterval;
    }

    function getMinRateDelta() external view responsible returns (uint) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } FixedPoint128.encodeFromNumeratorAndDenominator(
            _options.minRateDeltaNumerator,
            _options.minRateDeltaDenominator
        );
    }

    function isInitialized() external view responsible returns (bool) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } !_points.empty();
    }

    function onCodeUpgrade(TvmCell data) private {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 2);
        tvm.resetStorage();
        TvmSlice s = data.toSlice();

        address send_gas_to;
        uint32 old_version;

        active = true;

        (root, vault, old_version, current_version, send_gas_to) = s.decode(address, address, uint32, uint32, address);

        platform_code = s.loadRef(); // ref 1

        TvmSlice tokens_data_slice =  s.loadRefAsSlice(); // ref 2
        (left_root, right_root) = tokens_data_slice.decode(address, address);

        TvmCell otherDataCell = s.loadRef();    // ref 3

        (
            lp_root,
            lp_wallet,
            lp_supply,

            fee,

            left_wallet,
            vault_left_wallet,
            left_balance,

            right_wallet,
            vault_right_wallet,
            right_balance
        ) = abi.decode(otherDataCell, (
            address, address, uint128,
            FeeParams,
            address, address, uint128,
            address, address, uint128
        ));

        TvmSlice oracleDataSlice = s.loadRefAsSlice();  // ref 4

        (
            _points,
            _options,
            _length
        ) = oracleDataSlice.decode(
            mapping(uint32 => Point),
            OracleOptions,
            uint16
        );

        newTestField = "New Pair";

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function newFunc() public view returns (string) {
        return newTestField;
    }
}
