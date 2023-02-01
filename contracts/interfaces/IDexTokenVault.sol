pragma ton-solidity >= 0.62.0;

import "./IResetGas.sol";
import "./IUpgradableByRequest.sol";

interface IDexTokenVault is IResetGas, IUpgradableByRequest {
    event TokenVaultCodeUpgraded(
        uint32 currentVersion,
        uint32 previousVersion
    );

    event WithdrawTokens(
        uint128 amount,
        address accountOwner,
        address recipientAddress
    );

    event PairTransferTokens(
        uint128 amount,
        address[] roots,
        address recipientAddress
    );

    event ReferralFeeTransfer(
        uint128 amount,
        address[] roots,
        address referrer,
        address referral
    );

    function getDexRoot() external view responsible returns (address);

    function getVersion() external view responsible returns (uint32);

    function getPlatformCode() external view responsible returns (TvmCell);

    function getTokenRoot() external view responsible returns (address);

    function getTokenWallet() external view responsible returns (address);

    function getLegacyVault() external view responsible returns (address);

    function getTargetBalance() external view responsible returns (uint128);

    function withdraw(
        uint64 _callId,
        uint128 _amount,
        address _recipientAddress,
        uint128 _deployWalletGrams,
        address _accountOwner,
        uint32  _accountVersion,
        address _remainingGasTo
    ) external;

    function transfer(
        uint128 _amount,
        address _recipientAddress,
        uint128 _deployWalletGrams,
        bool _notifyReceiver,
        TvmCell _payload,
        address[] _roots,
        uint32 _pairVersion,
        address _remainingGasTo
    ) external;

    function referralFeeTransfer(
        uint128 _amount,
        address _referrer,
        address _referral,
        address[] _roots
    ) external;

    function redeploy(
        TvmCell _code,
        uint32 _version,
        address,
        address _remainingGasTo
    ) external functionID(0x15a038fb);
}
