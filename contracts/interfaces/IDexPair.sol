pragma ton-solidity >= 0.57.0;

import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "../structures/ITokenOperationStructure.sol";
import "../structures/IFeeParams.sol";

interface IDexPair is IFeeParams, ITokenOperationStructure, IAcceptTokensTransferCallback {

    event PairCodeUpgraded(uint32 version, uint8 pool_type);
    event FeesParamsUpdated(FeeParams params);

    event DepositLiquidity(
        address sender,
        address owner,
        TokenOperation[] tokens,
        uint128 lp
    );

    event WithdrawLiquidity(
        address sender,
        address owner,
        uint128 lp,
        TokenOperation[] tokens
    );

    struct ExchangeFee {
        address feeTokenRoot;
        uint128 pool_fee;
        uint128 beneficiary_fee;
        address beneficiary;
    }

    event Exchange(
        address sender,
        address recipient,
        address spentTokenRoot,
        uint128 spentAmount,
        address receiveTokenRoot,
        uint128 receiveAmount,
        ExchangeFee[] fees
    );

    event Sync(uint128[] reserves, uint128 lp_supply);

    struct IDexPairBalances {
        uint128 lp_supply;
        uint128 left_balance;
        uint128 right_balance;
    }

    function getRoot() external view responsible returns (address dex_root);

    function getTokenRoots() external view responsible returns (address left_root, address right_root, address lp_root);

    function getTokenWallets() external view responsible returns (address left, address right, address lp);

    function getVersion() external view responsible returns (uint32 version);

    function getPoolType() external view responsible returns (uint8);

    function getVault() external view responsible returns (address dex_vault);

    function getVaultWallets() external view responsible returns (address left, address right);

    function setFeeParams(FeeParams params, address send_gas_to) external;

    function getFeeParams() external view responsible returns (FeeParams params);

    function getAccumulatedFees() external view responsible returns (uint128[] accumulatedFees);

    function isActive() external view responsible returns (bool);

    function getBalances() external view responsible returns (IDexPairBalances);

    function expectedExchange(
        uint128 amount,
        address spent_token_root
    ) external view responsible returns (uint128 expected_amount, uint128 expected_fee);

    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root
    ) external view responsible returns (uint128 expected_amount, uint128 expected_fee);

    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) external view responsible returns (uint128 expected_left_amount, uint128 expected_right_amount);

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // UPGRADE
    function upgrade(TvmCell code, uint32 new_version, uint8 new_type, address send_gas_to) external;

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // INTERNAL

    function checkPair(address account_owner, uint32 account_version) external;

    function liquidityTokenRootDeployed(address lp_root, address send_gas_to) external;
    function liquidityTokenRootNotDeployed(address lp_root, address send_gas_to) external;

    function exchange(
        uint64  call_id,
        uint128 spent_amount,
        address spent_token_root,
        address receive_token_root,
        uint128 expected_amount,
        address account_owner,
        uint32  account_version,
        address send_gas_to
    ) external;

    function depositLiquidity(
        uint64  call_id,
        uint128 left_amount,
        uint128 right_amount,
        address expected_lp_root,
        bool    auto_change,
        address account_owner,
        uint32  account_version,
        address send_gas_to
    ) external;

    function withdrawLiquidity(
        uint64  call_id,
        uint128 lp_amount,
        address expected_lp_root,
        address account_owner,
        uint32  account_version,
        address send_gas_to
    ) external;

    function crossPoolExchange(
        uint64 _id,
        uint32 _prevPoolVersion,
        uint8 _prevPoolType,
        address[] _prevPoolTokenRoots,
        address _spentTokenRoot,
        uint128 _spentAmount,
        address _senderAddress,
        address _recipient,
        address _remainingGasTo,
        uint128 _deployWalletGrams,
        TvmCell _nextPayload,
        bool _notifySuccess,
        TvmCell _successPayload,
        bool _notifyCancel,
        TvmCell _cancelPayload
    ) external;
}
