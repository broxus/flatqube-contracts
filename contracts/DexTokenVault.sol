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
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexTokenVault.sol";
import "./interfaces/IDexPairOperationCallback.sol";

import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/PairPayload.sol";
import "./libraries/DirectOperationErrors.sol";

contract DexTokenVault is DexContractBase, IDexTokenVault {
    address private _root;
    address private _vault;
    uint32 private _version;

    address private _tokenRoot;
    address private _tokenWallet;

    address private _remainingGasToAfterDeploy;

    //  __  __  ___  ____ ___ _____ ___ _____ ____  ____
    // |  \/  |/ _ \|  _ \_ _|  ___|_ _| ____|  _ \/ ___|
    // | |\/| | | | | | | | || |_   | ||  _| | |_) \___ \
    // | |  | | |_| | |_| | ||  _|  | || |___|  _ < ___) |
    // |_|  |_|\___/|____/___|_|   |___|_____|_| \_\____/

    modifier onlyDexRoot() {
        require(
            _root.value != 0 && msg.sender == _root,
            DexErrors.NOT_ROOT
        );
        _;
    }

    modifier onlyTokenRoot() {
        require(
            _tokenRoot.value != 0 && msg.sender == _tokenRoot,
            DexErrors.WRONG_TOKEN_ROOT
        );
        _;
    }

    modifier onlyTokenWallet() {
        require(
            _tokenWallet.value != 0 && msg.sender == _tokenWallet,
            DexErrors.NOT_TOKEN_VAULT_WALLET
        );
        _;
    }

    modifier reserve(uint128 _reserve) {
        tvm.rawReserve(_reserve, 0);
        _;
    }

    //  ____  ____  _____ ____ ___    _    _
    // / ___||  _ \| ____/ ___|_ _|  / \  | |
    // \___ \| |_) |  _|| |    | |  / _ \ | |
    //  ___) |  __/| |__| |___ | | / ___ \| |___
    // |____/|_|   |_____\____|___/_/   \_\_____|

    /// @notice Refund incoming transfer to message sender
    receive()
        external
        pure
        reserve(_getTargetBalanceInternal())
    {
        msg.sender.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    fallback() external pure { revert(); }

    constructor() public { revert(); }

    function redeploy(
        TvmCell /* _tokenVaultCodeInRoot */,
        uint32 /* _tokenVaultVersionInRoot */,
        address /* _vault */,
        address _remainingGasTo
    )
        external
        override
        functionID(0x15a038fb)
        reserve(_getTargetBalanceInternal())
        onlyDexRoot
    {
        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    //   ____ _____ _____ _____ _____ ____  ____
    //  / ___| ____|_   _|_   _| ____|  _ \/ ___|
    // | |  _|  _|   | |   | | |  _| | |_) \___ \
    // | |_| | |___  | |   | | | |___|  _ < ___) |
    //  \____|_____| |_|   |_| |_____|_| \_\____/

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

    function getVault() external view override responsible returns (address) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _vault;
    }

    function getTargetBalance() external view override responsible returns (uint128) {
        return {
            value: 0,
            flag: MsgFlag.REMAINING_GAS,
            bounce: false
        } _getTargetBalanceInternal();
    }

    //   ___  ____  _____ ____      _  _____ ___ ___  _   _ ____
    //  / _ \|  _ \| ____|  _ \    / \|_   _|_ _/ _ \| \ | / ___|
    // | | | | |_) |  _| | |_) |  / _ \ | |  | | | | |  \| \___ \
    // | |_| |  __/| |___|  _ <  / ___ \| |  | | |_| | |\  |___) |
    //  \___/|_|   |_____|_| \_\/_/   \_\_| |___\___/|_| \_|____/

    function withdraw(
        uint64 _callId,
        uint128 _amount,
        address _recipient,
        uint128 _deployRecipientWalletGrams,
        address _accountOwner,
        uint32  /* _accountVersion */,
        address _remainingGasTo
    )
        external
        override
        reserve(_getTargetBalanceInternal())
        onlyAccount(_accountOwner)
    {
        TvmCell empty;

        ITokenWallet(_tokenWallet)
            .transfer{
                value: DexGas.TRANSFER_TOKENS_VALUE + _deployRecipientWalletGrams,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(
                _amount,
                _recipient,
                _deployRecipientWalletGrams,
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

        emit WithdrawTokens({
            amount: _amount,
            accountOwner: _accountOwner,
            recipient: _recipient
        });
    }

    function transfer(
        uint128 _amount,
        address _recipient,
        uint128 _deployRecipientWalletGrams,
        bool _notifyRecipient,
        TvmCell _payload,
        address[] _poolTokenRoots,
        uint32 /* _poolVersion */,
        address _remainingGasTo
    )
        external
        override
        reserve(_getTargetBalanceInternal())
        onlyPool(_poolTokenRoots)
    {
        ITokenWallet(_tokenWallet)
            .transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                _amount,
                _recipient,
                _deployRecipientWalletGrams,
                _remainingGasTo,
                _notifyRecipient,
                _payload
            );

        emit PairTransferTokens({
            amount: _amount,
            poolTokenRoots: _poolTokenRoots,
            recipient: _recipient
        });
    }

    function referralFeeTransfer(
        uint128 _amount,
        address _referrer,
        address _referral,
        address[] _poolTokenRoots
    )
        external
        override
        reserve(_getTargetBalanceInternal())
        onlyPool(_poolTokenRoots)
    {
        TvmBuilder builder;

        builder.store(DexOperationTypes.REFERRAL_FEE);
        builder.storeRef(abi.encode(_poolTokenRoots, _referrer, _referral));

        ITokenWallet(_tokenWallet)
            .transfer{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                bounce: false
            }(
                _amount,
                _vault,
                0,
                _referral,
                true,
                builder.toCell()
            );

        emit ReferralFeeTransfer({
            amount: _amount,
            poolTokenRoots: _poolTokenRoots,
            referrer: _referrer,
            referral: _referral
        });
    }

    function resetGas(address _remainingGasTo)
        external
        view
        override
        reserve(_getTargetBalanceInternal())
        onlyDexRoot
    {
        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    //  _   _ ____   ____ ____      _    ____  _____
    // | | | |  _ \ / ___|  _ \    / \  |  _ \| ____|
    // | | | | |_) | |  _| |_) |  / _ \ | | | |  _|
    // | |_| |  __/| |_| |  _ <  / ___ \| |_| | |___
    //  \___/|_|    \____|_| \_\/_/   \_\____/|_____|

    function upgrade(
        TvmCell _newCode,
        uint32 _newVersion,
        address _remainingGasTo
    )
        external
        override
        reserve(_getTargetBalanceInternal())
        onlyDexRoot
    {
        TvmCell params = abi.encode(
            _tokenRoot,
            _tokenWallet,
            _remainingGasToAfterDeploy
        );

        TvmBuilder builder;

        builder.store(_root);
        builder.store(_vault);
        builder.store(_version);
        builder.store(_newVersion);
        builder.store(_remainingGasTo);

        builder.store(platform_code);
        builder.store(params);

        tvm.setcode(_newCode);
        tvm.setCurrentCode(_newCode);

        onCodeUpgrade(builder.toCell());
    }

    function onCodeUpgrade(TvmCell _data)
        private
        reserve(_getTargetBalanceInternal())
    {
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

    /// @notice Upgrade from platform code
    function _onPlatformUpgrade(TvmCell _data) private {
        TvmSlice slice = _data.toSlice();

        (
            /* address root */,
            /* address vault */,
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
        _remainingGasToAfterDeploy = remainingGasTo;
        platform_code = slice.loadRef();
        _tokenRoot = slice.loadRefAsSlice().decode(address);

        if (_tokenRoot.value == 0) {
            _destroySelf();
        } else {
            emit TokenVaultCodeUpgraded({
                currentVersion: currentVersion,
                previousVersion: 0
            });

            _deployTokenWallet();
            _deployTokenWalletForVault();

            remainingGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                bounce: false
            });
        }
    }

    /// @notice Upgrade already deployed contract
    function _onUpgrade(TvmCell _data) private {
        TvmSlice slice = _data.toSlice();

        (
            /* address root */,
            /* address vault */,
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
            _remainingGasToAfterDeploy
        ) = abi.decode(slice.loadRef(), (
            address,
            address,
            address
        ));

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

    //  ___ _   _ _____ _____ ____  _   _    _    _
    // |_ _| \ | |_   _| ____|  _ \| \ | |  / \  | |
    //  | ||  \| | | | |  _| | |_) |  \| | / _ \ | |
    //  | || |\  | | | | |___|  _ <| |\  |/ ___ \| |___
    // |___|_| \_| |_| |_____|_| \_\_| \_/_/   \_\_____|

    function _dexRoot()
        internal
        view
        override
        returns (address)
    {
        return _root;
    }

    /// @notice Balance to keep for contract
    function _getTargetBalanceInternal()
        internal
        pure
        returns (uint128)
    {
        return DexGas.VAULT_INITIAL_BALANCE;
    }

    /// @notice Deploys and sets vault's wallet after deploy
    /// @dev vault's _tokenRoot must be valid before call
    function _deployTokenWallet() private view {
        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexTokenVault.onTokenWallet
            }(address(this), DexGas.DEPLOY_EMPTY_WALLET_GRAMS);
    }

    /// @notice Deploys wallet for vault after token vault wallet deploy
    function _deployTokenWalletForVault() private view {
        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexTokenVault.onVaultTokenWallet
            }(_vault, DexGas.DEPLOY_EMPTY_WALLET_GRAMS);
    }

    /// @notice Destroys vault and transfers all balance to gas recipient from initial deploy
    function _destroySelf() private view reserve(0) {
        _remainingGasToAfterDeploy.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO,
            bounce: false
        });
    }

    //   ____    _    _     _     ____    _    ____ _  ______
    //  / ___|  / \  | |   | |   | __ )  / \  / ___| |/ / ___|
    // | |     / _ \ | |   | |   |  _ \ / _ \| |   | ' /\___ \
    // | |___ / ___ \| |___| |___| |_) / ___ \ |___| . \ ___) |
    //  \____/_/   \_\_____|_____|____/_/   \_\____|_|\_\____/

    function onAcceptTokensMint(
        address _mintedTokenRoot,
        uint128 _amount,
        address _remainingGasTo,
        TvmCell _payload
    )
        external
        override
        reserve(_getTargetBalanceInternal())
        onlyTokenWallet
    {
        TvmSlice payloadSlice = _payload.toSlice();
        uint8 op = DexOperationTypes.CROSS_PAIR_EXCHANGE_V2;

        TvmCell exchangeData = payloadSlice.loadRef();

        (
            uint64 id,
            uint32 currentVersion,
            uint8 currentType,
            address[] roots,
            address senderAddress,
            address recipient,
            address referrer,
            uint128 deployWalletGrams,
            NextExchangeData[] nextSteps
        ) = abi.decode(exchangeData, (
            uint64,
            uint32,
            uint8,
            address[],
            address,
            address,
            address,
            uint128,
            NextExchangeData[]
        ));

        TvmCell successPayload;
        TvmCell cancelPayload;

        bool notifySuccess = payloadSlice.refs() >= 1;
        bool notifyCancel = payloadSlice.refs() >= 2;

        if (notifySuccess) {
            successPayload = payloadSlice.loadRef();
        }

        if (notifyCancel) {
            cancelPayload = payloadSlice.loadRef();
        }

        uint16 errorCode = 0;

        uint256 denominator = 0;
        address prevPool = _expectedPoolAddress(roots);
        uint32 allNestedNodes = uint32(nextSteps.length);
        uint32 allLeaves = 0;
        uint32 maxNestedNodes = 0;
        uint32 maxNestedNodesIdx = 0;

        for (uint32 i = 0; i < nextSteps.length; i++) {
            NextExchangeData nextStep = nextSteps[i];

            if (
                nextStep.poolRoot.value == 0 ||
                nextStep.poolRoot == prevPool ||
                nextStep.numerator == 0 ||
                nextStep.leaves == 0
            ) {
                errorCode = DirectOperationErrors.INVALID_NEXT_STEPS;
                break;
            }

            if (nextStep.nestedNodes > maxNestedNodes) {
                maxNestedNodes = nextStep.nestedNodes;
                maxNestedNodesIdx = i;
            }

            denominator += nextStep.numerator;
            allNestedNodes += nextStep.nestedNodes;
            allLeaves += nextStep.leaves;
        }

        if (errorCode == 0 && msg.value < DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE * allNestedNodes + 0.1 ton) {
            errorCode = DirectOperationErrors.VALUE_TOO_LOW;
        }

        if (errorCode == 0 && nextSteps.length > 0) {
            uint128 extraValue = msg.value - DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE * allNestedNodes - 0.1 ton;

            for (uint32 i = 0; i < nextSteps.length; i++) {
                NextExchangeData nextStep = nextSteps[i];

                uint128 nextPoolAmount = uint128(math.muldiv(_amount, nextStep.numerator, denominator));
                uint128 currentExtraValue = math.muldiv(uint128(nextStep.leaves), extraValue, uint128(allLeaves));

                IDexBasePool(nextStep.poolRoot)
                    .crossPoolExchange{
                        value: i == maxNestedNodesIdx ? 0 : (nextStep.nestedNodes + 1) * DexGas.CROSS_POOL_EXCHANGE_MIN_VALUE + currentExtraValue,
                        flag: i == maxNestedNodesIdx ? MsgFlag.ALL_NOT_RESERVED : MsgFlag.SENDER_PAYS_FEES
                    }(
                        id,

                        currentVersion,
                        currentType,

                        roots,

                        op,
                        _mintedTokenRoot,
                        nextPoolAmount,

                        senderAddress,
                        recipient,
                        referrer,

                        _remainingGasTo,
                        deployWalletGrams,

                        nextStep.payload,
                        notifySuccess,
                        successPayload,
                        notifyCancel,
                        cancelPayload
                );
            }
        } else {
            bool isLastStep = nextSteps.length == 0;

            if (isLastStep) {
                emit PairTransferTokens({
                    amount: _amount,
                    poolTokenRoots: roots,
                    recipient: recipient
                });
            } else {
                IDexPairOperationCallback(senderAddress)
                    .dexPairOperationCancelled{
                        value: DexGas.OPERATION_CALLBACK_BASE + 44,
                        flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    }(id);

                if (recipient != senderAddress) {
                    IDexPairOperationCallback(recipient)
                        .dexPairOperationCancelled{
                            value: DexGas.OPERATION_CALLBACK_BASE,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(id);
                }
            }

            ITokenWallet(_tokenWallet)
                .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    _amount,
                    isLastStep ? recipient : senderAddress,
                    deployWalletGrams,
                    _remainingGasTo,
                    isLastStep ? notifySuccess : notifyCancel,
                    isLastStep
                    ? PairPayload.buildSuccessPayload(op, successPayload, senderAddress)
                    : PairPayload.buildCancelPayload(op, errorCode, cancelPayload, nextSteps)
                );
        }
    }

    /// @notice Saves the address of the deployed vault's wallet
    /// @dev Will destroy contract if the first wallet is invalid
    function onTokenWallet(address _wallet)
        external
        reserve(_getTargetBalanceInternal())
        onlyTokenRoot
    {
        if (_wallet.value == 0 && _tokenWallet.value == 0) {
            _destroySelf();
        } else {
            if (_tokenWallet.value == 0) {
                _tokenWallet = _wallet;

                emit TokenWalletSet(_wallet);

                IDexRoot(_root)
                    .onTokenVaultDeployed{
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED,
                        bounce: false
                    }(
                        _version,
                        _tokenRoot,
                        _tokenWallet,
                        _remainingGasToAfterDeploy
                    );
            } else {
                _remainingGasToAfterDeploy.transfer({
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                });
            }
        }
    }

    /// @notice Saves the address of the deployed vault's wallet
    /// @dev Vault's token wallet must be deployed before
    function onVaultTokenWallet(address _wallet)
        external
        view
        reserve(_getTargetBalanceInternal())
        onlyTokenRoot
    {
        emit VaultTokenWalletDeployed(_wallet);

        _remainingGasToAfterDeploy.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    /// @notice Catches failed wallet deploy for vault
    onBounce(TvmSlice _body)
        external
        view
        reserve(_getTargetBalanceInternal())
        onlyTokenRoot
    {
        uint32 functionId = _body.decode(uint32);

        // Destroy vault if wallet wasn't deployed
        if (
            functionId == tvm.functionId(ITokenRoot.deployWallet) &&
            _tokenWallet.value == 0
        ) {
            _destroySelf();
        }
    }
}
