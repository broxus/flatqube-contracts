pragma ton-solidity >= 0.62.0;

import "tip3/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "../interfaces/IUpgradable.sol";
import "../interfaces/IResetGas.sol";

import "../structures/IReferralProgramParams.sol";

interface IDexVault is
    IUpgradable,
    IResetGas,
    IAcceptTokensTransferCallback,
    IReferralProgramParams
{
    event VaultCodeUpgraded();

    event RequestedOwnerTransfer(address old_owner, address new_owner);
    event OwnerTransferAccepted(address old_owner, address new_owner);

    event ReferralFeeTransfer(
        address tokenRoot,
        address vaultWallet,
        uint128 amount,
        address[] roots,
        address referrer,
        address referral
    );

    function getOwner() external view responsible returns (address);

    function getPendingOwner() external view responsible returns (address);

    function getManager() external view responsible returns (address);

    function getRoot() external view responsible returns (address);

    function getReferralProgramParams() external view responsible returns (ReferralProgramParams);

    function setManager(address _newManager) external;

    function revokeManager() external;

    function resetTargetGas(
        address target,
        address receiver
    ) external view;

    function setReferralProgramParams(ReferralProgramParams params) external;

    function transferOwner(address new_owner) external;

    function acceptOwner() external;
}
