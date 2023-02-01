pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "tip3/contracts/interfaces/ITokenRoot.sol";
import "tip3/contracts/interfaces/ITokenWallet.sol";

import "./abstract/DexContractBase.sol";

import "./interfaces/IDexAccount.sol";
import "./interfaces/IDexBasePool.sol";
import "./interfaces/IDexTokenVault.sol";
import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IResetGas.sol";
import "./interfaces/IDexVault.sol";

import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";

contract DexTokenVault is
    DexContractBase,
    IDexTokenVault,
    IResetGas,
    IUpgradableByRequest
{
    address private _root;
    address private _vault;
    uint32 private _version;
    address private _tokenRoot;
    address private _tokenWallet;
    address private _firstCallbackRecipient;
    address private _firstCallbackRemainingGasTo;

    function _dexRoot() internal view override returns (address) {
        return _root;
    }

    modifier onlyDexRoot() {
        require(_root.value != 0 && msg.sender == _root, DexErrors.NOT_MY_OWNER);
        _;
    }

    modifier onlyTokenRoot() {
        require(_tokenRoot.value != 0 && msg.sender == _tokenRoot, DexErrors.WRONG_TOKEN_ROOT);
        _;
    }

    receive() external pure { revert(); }

    fallback() external pure { revert(); }

    constructor() public { revert(); }

    function redeploy(
        TvmCell /* _code */,
        uint32 /* _vaultCodeVersionInRoot */,
        address /* _callbackRecipient */,
        address _remainingGasTo
    )
        external
        override
        functionID(0x15a038fb)
        onlyDexRoot
    {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 0);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    function getDexRoot() external view override responsible returns (address) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _root;
    }

    function getVersion() external view override responsible returns (uint32) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _version;
    }

    function getPlatformCode() external view override responsible returns (TvmCell) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } platform_code;
    }

    function getTokenRoot() external view override responsible returns (address) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _tokenRoot;
    }

    function getTokenWallet() external view override responsible returns (address) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _tokenWallet;
    }

    function withdraw(
        uint64 _callId,
        uint128 _amount,
        address _recipientAddress,
        uint128 _deployWalletGrams,
        address _accountOwner,
        uint32 /* _accountVersion */,
        address _remainingGasTo
    ) external override onlyAccount(_accountOwner) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit WithdrawTokens({
            amount: _amount,
            accountOwner: _accountOwner,
            recipientAddress: _recipientAddress
        });

        TvmCell empty;

        ITokenWallet(_tokenWallet)
            .transfer{
                value: DexGas.TRANSFER_TOKENS_VALUE + _deployWalletGrams,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(
                _amount,
                _recipientAddress,
                _deployWalletGrams,
                _remainingGasTo,
                false,
                empty
            );

        IDexAccount(msg.sender)
            .successCallback{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_callId);
    }

    function transfer(
        uint128 _amount,
        address _recipientAddress,
        uint128 _deployWalletGrams,
        bool _notifyReceiver,
        TvmCell _payload,
        address[] _roots,
        uint32 /* _pairVersion */,
        address _remainingGasTo
    ) external override {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit PairTransferTokens({
            amount: _amount,
            roots: _roots,
            recipientAddress: _recipientAddress
        });

        ITokenWallet(_tokenWallet)
            .transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                _amount,
                _recipientAddress,
                _deployWalletGrams,
                _remainingGasTo,
                _notifyReceiver,
                _payload
            );
    }

    function referralFeeTransfer(
        uint128 _amount,
        address _referrer,
        address _referral,
        address[] _roots
    ) external override onlyPool(_roots) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit ReferralFeeTransfer({
            amount: _amount,
            roots: _roots,
            referrer: _referrer,
            referral: _referral
        });

        IDexVault(_vault)
            .referralFeeTransfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(_amount, _tokenRoot, _tokenWallet, _referrer, _referral, _roots);
    }

    function resetGas(address _remainingGasTo)
        external
        override
        view
        onlyDexRoot
    {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function upgrade(
        TvmCell _newCode,
        uint32 _newVersion,
        address _remainingGasTo
    ) external override onlyDexRoot {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        TvmBuilder builder;
        TvmBuilder params;

        params.store(_tokenRoot);
        params.store(_tokenWallet);
        params.store(_firstCallbackRemainingGasTo);

        builder.store(_root);
        builder.store(_firstCallbackRecipient);
        builder.store(_version);
        builder.store(_newVersion);
        builder.store(_remainingGasTo);

        builder.store(platform_code);
        builder.store(params);

        tvm.setcode(_newCode);
        tvm.setCurrentCode(_newCode);

        onCodeUpgrade(builder.toCell());
    }

    function onCodeUpgrade(TvmCell _data) private {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 0);
        tvm.resetStorage();

        TvmSlice slice = _data.toSlice();

        (
            address root,
            address vault,
            uint32 previousVersion
        ) = slice.decode(
            address,
            address,
            uint32
        );

        _root = root;
        _vault = vault;

        if (previousVersion == 0) {
            _onPlatformUpgrade(_data);
        } else {
            _onUpgrade(_data);
        }
    }

    function _onPlatformUpgrade(TvmCell _data) private {
        TvmSlice slice = _data.toSlice();

        (
            /* address root */,
            /* address firstCallbackRecipient */,
            /* uint32 previousVersion */,
            uint32 currentVersion,
            address remainingGasTo
        ) = slice.decode(
            address,
            address,
            uint32,
            uint32,
            address
        );

        _version = currentVersion;
        _firstCallbackRemainingGasTo = remainingGasTo;
        platform_code = slice.loadRef();
        _tokenRoot = slice.loadRefAsSlice().decode(address);

        emit TokenVaultCodeUpgraded({
            currentVersion: currentVersion,
            previousVersion: 0
        });

        _deployTokenWallet();

        remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function _onUpgrade(TvmCell _data) private {
        TvmSlice slice = _data.toSlice();

        (
            /* address root */,
            /* address firstCallbackRecipient */,
            uint32 previousVersion,
            uint32 currentVersion,
            address remainingGasTo
        ) = slice.decode(
            address,
            address,
            uint32,
            uint32,
            address
        );

        _version = currentVersion;
        platform_code = slice.loadRef();
        (
            _tokenRoot,
            _tokenWallet,
            _firstCallbackRemainingGasTo
        ) = slice.loadRefAsSlice().decode(
            address,
            address,
            address
        );

        emit TokenVaultCodeUpgraded({
            currentVersion: currentVersion,
            previousVersion: previousVersion
        });

        remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function _deployTokenWallet() private {
        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexTokenVault.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);
    }

    function onTokenWallet(address _wallet) external onlyTokenRoot {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 0);

        _tokenWallet = _wallet;

        _firstCallbackRemainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }
}
