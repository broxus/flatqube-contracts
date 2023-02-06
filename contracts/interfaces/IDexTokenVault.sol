pragma ton-solidity >= 0.62.0;

import "tip3/contracts/interfaces/IAcceptTokensMintCallback.sol";

import "../structures/INextExchangeData.sol";

import "./IResetGas.sol";
import "./IUpgradableByRequest.sol";

/// @title DEX Token Vault Interface
interface IDexTokenVault is
    IResetGas,
    IUpgradableByRequest,
    IAcceptTokensMintCallback,
    INextExchangeData
{
    event TokenVaultCodeUpgraded(
        uint32 currentVersion,
        uint32 previousVersion
    );

    event TokenWalletSet(address wallet);

    event LegacyVaultTokenWalletSet(address wallet);

    event WithdrawTokens(
        uint128 amount,
        address accountOwner,
        address recipient
    );

    event PairTransferTokens(
        uint128 amount,
        address[] poolTokenRoots,
        address recipient
    );

    event ReferralFeeTransfer(
        uint128 amount,
        address[] poolTokenRoots,
        address referrer,
        address referral
    );

    function getDexRoot() external view responsible returns (address);

    function getVersion() external view responsible returns (uint32);

    function getPlatformCode() external view responsible returns (TvmCell);

    function getTokenRoot() external view responsible returns (address);

    function getTokenWallet() external view responsible returns (address);

    function getLegacyVault() external view responsible returns (address);

    function getLegacyVaultTokenWallet() external view responsible returns (address);

    function getTargetBalance() external view responsible returns (uint128);

    /// @notice Withdraws account's token from DEX vault to recipient
    function withdraw(
        uint64 _callId,
        uint128 _amount,
        address _recipient,
        uint128 _deployRecipientWalletGrams,
        address _accountOwner,
        uint32  _accountVersion,
        address _remainingGasTo
    ) external;

    /// @notice Transfers token from DEX vault to recipient
    function transfer(
        uint128 _amount,
        address _recipient,
        uint128 _deployRecipientWalletGrams,
        bool _notifyRecipient,
        TvmCell _payload,
        address[] _poolTokenRoots,
        uint32 _poolVersion,
        address _remainingGasTo
    ) external;

    /// @notice Transfers referral fees to legacy vault
    function referralFeeTransfer(
        uint128 _amount,
        address _referrer,
        address _referral,
        address[] _poolTokenRoots
    ) external;

    /// @notice Catches redeploy and refund remaining gas
    function redeploy(
        TvmCell _tokenVaultCodeInRoot,
        uint32 _tokenVaultVersionInRoot,
        address _legacyVault,
        address _remainingGasTo
    ) external functionID(0x15a038fb);
}
