pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "../libraries/DexErrors.sol";
import "../libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "../interfaces/IDexPair.sol";
import "../structures/ITokenOperationStructure.sol";
import "../structures/IDexPairBalances.sol";

// This is just for test purposes, this is not a real contract!
contract TestNewDexPair is ITokenOperationStructure, IFeeParams, IDexPairBalances {
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

    function getBalances() external view responsible returns (DexPairBalances) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } DexPairBalances(
            lp_supply,
            left_balance,
            right_balance
        );
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
        (left_root, right_root, lp_root) = tokens_data_slice.decode(address, address, address);

        TvmSlice token_balances_data_slice = tokens_data_slice.loadRefAsSlice(); // ref 2_1
        (lp_supply, left_balance, right_balance) =
        token_balances_data_slice.decode(uint128, uint128, uint128);

        TvmSlice fee_data_slice = tokens_data_slice.loadRefAsSlice();
        (
            uint64 denominator,
            uint64 pool_numerator,
            uint64 beneficiary_numerator,
            address beneficiary,
            uint128 threshold_left,
            uint128 threshold_right
        ) = fee_data_slice.decode(uint64, uint64, uint64, address, uint128, uint128);

        mapping(address => uint128) fee_threshold;

        fee_threshold[left_root] = threshold_left;
        fee_threshold[right_root] = threshold_right;

        fee = FeeParams(
            denominator,
            pool_numerator,
            beneficiary_numerator,
            beneficiary,
            fee_threshold
        );

        TvmSlice pair_wallets_data_slice = s.loadRefAsSlice(); // ref 3
        (lp_wallet, left_wallet, right_wallet) = pair_wallets_data_slice.decode(address, address, address);

        TvmSlice vault_wallets_data = s.loadRefAsSlice(); // ref 4
        (vault_left_wallet, vault_right_wallet) = vault_wallets_data.decode(address, address);

        newTestField = "New Pair";

        send_gas_to.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function newFunc() public view returns (string) {
        return newTestField;
    }
}
