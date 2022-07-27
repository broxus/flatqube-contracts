pragma ton-solidity >= 0.57.0;

import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "../structures/ITokenOperationStructure.sol";
import "../structures/IExchangeStepStructure.sol";
import "../structures/IFeeParams.sol";
import "../structures/IExchangeFee.sol";
import "../structures/IDexPairBalances.sol";

import "./ILiquidityTokenRootDeployedCallback.sol";
import "./ILiquidityTokenRootNotDeployedCallback.sol";

/// @title DEX Pair Interface
/// @notice Interface for interaction with DEX pair
interface IDexPair is
    IFeeParams,
    ITokenOperationStructure,
    IAcceptTokensTransferCallback,
    IExchangeStepStructure,
    IExchangeFee,
    IDexPairBalances,
    ILiquidityTokenRootDeployedCallback,
    ILiquidityTokenRootNotDeployedCallback
{
    /// @dev Emits when pair's code was successfully upgraded
    event PairCodeUpgraded(
        uint32 version,
        uint8 pool_type
    );

    /// @dev Emits when fees config was successfully updated
    event FeesParamsUpdated(FeeParams params);

    /// @dev Emits when liquidity deposit was successfully processed
    event DepositLiquidity(
        address sender,
        address owner,
        TokenOperation[] tokens,
        uint128 lp
    );

    /// @dev Emits when liquidity withdrawal was successfully processed
    event WithdrawLiquidity(
        address sender,
        address owner,
        uint128 lp,
        TokenOperation[] tokens
    );

    /// @dev Emits when swap was successfully processed
    event Exchange(
        address sender,
        address recipient,
        address spentTokenRoot,
        uint128 spentAmount,
        address receiveTokenRoot,
        uint128 receiveAmount,
        ExchangeFee[] fees
    );

    /// @dev Emits when pair's reserves was changed
    event Sync(
        uint128[] reserves,
        uint128 lp_supply
    );

    /// @notice Get DEX root address of the pair
    /// @return dex_root DEX root address
    function getRoot() external view responsible returns (address dex_root);

    /// @notice Get TIP-3 tokens' roots of the pair
    /// @return left_root Packed info response about TokenRoots addresses
    function getTokenRoots() external view responsible returns (
        address left_root,
        address right_root,
        address lp_root
    );

    /// @notice Get TIP-3 tokens' wallets of the pair
    /// @return left Packed info response about TokenWallets addresses
    function getTokenWallets() external view responsible returns (
        address left,
        address right,
        address lp
    );

    /// @notice Get current version of the pair
    /// @return version Version of the pair
    function getVersion() external view responsible returns (uint32 version);

    /// @notice Get type of the pair's pool
    /// @return uint8 Type of the pool
    function getPoolType() external view responsible returns (uint8);

    /// @notice Get DEX vault address
    /// @return dex_vault DEX vault address
    function getVault() external view responsible returns (address dex_vault);

    /// @notice Get TIP-3 tokens' wallets of the DEX vault
    /// @return left Packed info response about TokenWallets addresses
    function getVaultWallets() external view responsible returns (
        address left,
        address right
    );

    /// @notice Get pair's fees config
    /// @return params Packed info response about fee params
    function getFeeParams() external view responsible returns (FeeParams params);

    /// @notice Get pair's collected fee reserves
    /// @return accumulatedFees Collected fees
    function getAccumulatedFees() external view responsible returns (uint128[] accumulatedFees);

    /// @notice Get pair's status
    /// @return bool Whether or not pair is active
    function isActive() external view responsible returns (bool);

    /// @notice Get pair's reserves
    /// @return DexPairBalances Current reserves of the pair
    function getBalances() external view responsible returns (DexPairBalances);

    /// @notice Calculate expected fees and output amount for swap
    /// @param amount Input amount
    /// @param spent_token_root Input TIP-3 TokenRoot
    /// @return expected_amount Fees and output amount after swap
    function expectedExchange(
        uint128 amount,
        address spent_token_root
    ) external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    );

    /// @notice Calculate expected fees and input amount for swap
    /// @param receive_amount Output amount
    /// @param receive_token_root Output TIP-3 TokenRoot
    /// @return expected_amount Fees and input amount before swap
    function expectedSpendAmount(
        uint128 receive_amount,
        address receive_token_root
    ) external view responsible returns (
        uint128 expected_amount,
        uint128 expected_fee
    );

    /// @notice Calculate expected output amounts after liquidity withdrawal
    /// @param lp_amount Amount of LP tokens to burn
    /// @return expected_left_amount Expected left and right amounts
    function expectedWithdrawLiquidity(
        uint128 lp_amount
    ) external view responsible returns (
        uint128 expected_left_amount,
        uint128 expected_right_amount
    );

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // INTERNAL

    /// @notice Upgrades contract's code
    /// @dev Only the DEX root can perform
    /// @param _code Contract's new code
    /// @param _newVersion Number of the new update
    /// @param _newType New pool type
    /// @param _sendGasTo Receiver of the remaining gas
    function upgrade(
        TvmCell _code,
        uint32 _newVersion,
        uint8 _newType,
        address _sendGasTo
    ) external;

    /// @notice Set new fee configuration
    /// @dev Only the DEX root can perform
    /// @param _params New fee params
    /// @param _sendGasTo Receiver of the remaining gas
    function setFeeParams(
        FeeParams _params,
        address _sendGasTo
    ) external;

    /// @notice Check that pair exists from DEX account
    /// @dev Only the DEX account can perform
    /// @param _accountOwner Address of the DEX account owner
    /// @param _accountVersion Version of the account
    function checkPair(
        address _accountOwner,
        uint32 _accountVersion
    ) external;

    /// @notice Perform exchange from DEX account
    /// @dev Only the DEX account can perform
    /// @param _callId Id of the call
    /// @param _accountOwner Address of the DEX account owner
    /// @param _accountVersion Version of the account
    /// @param _sendGasTo Receiver of the remaining gas
    function exchange(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation _expected,
        address _accountOwner,
        uint32 _accountVersion,
        address _sendGasTo
    ) external;

    /// @notice Perform liquidity deposit from DEX account
    /// @dev Only the DEX account can perform
    /// @param _callId Id of the call
    /// @param _operations Input amounts
    /// @param _autoChange Whether or not swap token for full deposit
    /// @param _accountOwner Address of the DEX account owner
    /// @param _accountVersion Version of the account
    /// @param _remainingGasTo Receiver of the remaining gas
    function depositLiquidity(
        uint64 _callId,
        TokenOperation[] _operations,
        TokenOperation _expected,
        bool _autoChange,
        address _accountOwner,
        uint32 _accountVersion,
        address _remainingGasTo
    ) external;

    /// @notice Perform liquidity withdrawal from DEX account
    /// @dev Only the DEX account can perform
    /// @param _callId Id of the call
    /// @param _operation Address of the LP root
    /// @param _accountOwner Address of the DEX account owner
    /// @param _accountVersion Version of the account
    /// @param _remainingGasTo Receiver of the remaining gas
    function withdrawLiquidity(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation[] _expected,
        address _accountOwner,
        uint32 _accountVersion,
        address _remainingGasTo
    ) external;

    /// @notice Perform cross pool swap from another pair
    /// @dev Only the DEX pair can perform
    /// @param _id Id of the call
    /// @param _prevPoolVersion Version of the previous pair
    /// @param _prevPoolType Type of the previous pair
    /// @param _prevPoolTokenRoots TokenRoots of the previous pair
    /// @param _spentTokenRoot Input TokenRoot address
    /// @param _spentAmount Input amount
    /// @param _senderAddress Address of the sender
    /// @param _originalGasTo Receiver of the remaining gas
    /// @param _deployWalletGrams Amount to spent for new wallet deploy
    /// @param _nextPayload Payload for the next pair
    /// @param _notifySuccess Whether or not notify if swap was executed
    /// @param _successPayload Payload for callback about successful swap
    /// @param _notifyCancel Whether or not notify if swap was failed
    /// @param _cancelPayload Payload for callback about failed swap
    function crossPoolExchange(
        uint64 _id,

        uint32 _prevPoolVersion,
        uint8 _prevPoolType,

        address[] _prevPoolTokenRoots,

        address _spentTokenRoot,
        uint128 _spentAmount,

        address _senderAddress,

        address _originalGasTo,
        uint128 _deployWalletGrams,

        TvmCell _nextPayload,
        bool _notifySuccess,
        TvmCell _successPayload,
        bool _notifyCancel,
        TvmCell _cancelPayload
    ) external;
}
