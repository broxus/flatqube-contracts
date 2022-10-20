pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IBurnableTokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensMintCallback.sol";

import "./abstract/DexContractBase.sol";

import "./DexVaultLpTokenPendingV2.sol";
import "./interfaces/IDexVault.sol";
import "./interfaces/IDexBasePool.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IUpgradable.sol";
import "./interfaces/IResetGas.sol";

import "./structures/INextExchangeData.sol";

import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "./libraries/DexOperationTypes.sol";

contract DexVault is
    DexContractBase,
    IDexVault,
    IResetGas,
    IUpgradable,
    IAcceptTokensMintCallback,
    INextExchangeData
{
    uint32 private static _nonce;

    TvmCell private _lpTokenPendingCode;

    address private _root;
    address private _owner;
    address private _pendingOwner;

    address private _tokenFactory;

    modifier onlyOwner() {
        require(msg.sender == _owner, DexErrors.NOT_MY_OWNER);
        _;
    }

    modifier onlyLpTokenPending(
        uint32 nonce,
        address pool,
        address[] roots
    ) {
        address expected = address(
            tvm.hash(
                _buildLpTokenPendingInitData(
                    nonce,
                    pool,
                    roots
                )
            )
        );

        require(msg.sender == expected, DexErrors.NOT_LP_PENDING_CONTRACT);
        _;
    }

    constructor(
        address owner_,
        address root_,
        address token_factory_
    ) public {
        tvm.accept();

        _root = root_;
        _owner = owner_;
        _tokenFactory = token_factory_;
    }

    function _dexRoot() override internal view returns(address) {
        return _root;
    }

    function transferOwner(address new_owner) public override onlyOwner {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        emit RequestedOwnerTransfer(_owner, new_owner);

        _pendingOwner = new_owner;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function acceptOwner() public override {
        require(
            msg.sender == _pendingOwner &&
            msg.sender.value != 0,
            DexErrors.NOT_PENDING_OWNER
        );

        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        emit OwnerTransferAccepted(_owner, _pendingOwner);

        _owner = _pendingOwner;
        _pendingOwner = address(0);

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

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

    function setTokenFactory(address new_token_factory) public override onlyOwner {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        emit TokenFactoryAddressUpdated(
            _tokenFactory,
            new_token_factory
        );

        _tokenFactory = new_token_factory;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function installPlatformOnce(TvmCell code) external onlyOwner {
        require(platform_code.toSlice().empty(), DexErrors.PLATFORM_CODE_NON_EMPTY);

        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        platform_code = code;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function installOrUpdateLpTokenPendingCode(TvmCell code) public onlyOwner {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        _lpTokenPendingCode = code;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function addLiquidityToken(
        address pair,
        address left_root,
        address right_root,
        address send_gas_to
    ) public override onlyPair([left_root, right_root]) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );
        new DexVaultLpTokenPendingV2{
            stateInit: _buildLpTokenPendingInitData(
                now,
                pair,
                [left_root, right_root]
            ),
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            _tokenFactory,
            msg.value,
            send_gas_to
        );
    }

    function addLiquidityTokenV2(
        address pool,
        address[] roots,
        address send_gas_to
    ) public override onlyPair(roots) {
        tvm.rawReserve(math.max(DexGas.VAULT_INITIAL_BALANCE, address(this).balance - msg.value), 2);
        new DexVaultLpTokenPendingV2{
            stateInit: _buildLpTokenPendingInitData(
                now,
                pool,
                roots
            ),
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            _tokenFactory,
            msg.value,
            send_gas_to
        );
    }

    function onLiquidityTokenDeployed(
        uint32 nonce,
        address pool,
        address[] roots,
        address lp_root,
        address send_gas_to
    ) public override onlyLpTokenPending(
        nonce,
        pool,
        roots
    ) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IDexBasePool(pool)
            .liquidityTokenRootDeployed{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (lp_root, send_gas_to);
    }

    function onLiquidityTokenNotDeployed(
        uint32 nonce,
        address pool,
        address[] roots,
        address lp_root,
        address send_gas_to
    ) public override onlyLpTokenPending(
        nonce,
        pool,
        roots
    ) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IDexBasePool(pool)
            .liquidityTokenRootNotDeployed{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (lp_root, send_gas_to);
    }

    function withdraw(
        uint64 call_id,
        uint128 amount,
        address /* token_root */,
        address vault_wallet,
        address recipient_address,
        uint128 deploy_wallet_grams,
        address account_owner,
        uint32 /* account_version */,
        address send_gas_to
    ) external override onlyAccount(account_owner) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit WithdrawTokens(
            vault_wallet,
            amount,
            account_owner,
            recipient_address
        );

        TvmCell empty;

        ITokenWallet(vault_wallet)
            .transfer{
                value: DexGas.TRANSFER_TOKENS_VALUE + deploy_wallet_grams,
                flag: MsgFlag.SENDER_PAYS_FEES
            }(
                amount,
                recipient_address,
                deploy_wallet_grams,
                send_gas_to,
                false,
                empty
            );

        IDexAccount(msg.sender)
            .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (call_id);
    }

    function transfer(
        uint128 amount,
        address /* token_root */,
        address vault_wallet,
        address recipient_address,
        uint128 deploy_wallet_grams,
        bool    notify_receiver,
        TvmCell payload,
        address left_root,
        address right_root,
        uint32  /* pair_version */,
        address send_gas_to
    ) external override onlyPair([left_root, right_root]) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit PairTransferTokens(
            vault_wallet,
            amount,
            left_root,
            right_root,
            recipient_address
        );

        ITokenWallet(vault_wallet)
            .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                amount,
                recipient_address,
                deploy_wallet_grams,
                send_gas_to,
                notify_receiver,
                payload
            );
    }

    function transferV2(
        uint128 _amount,
        address,
        address _vaultWallet,
        address _recipientAddress,
        uint128 _deployWalletGrams,
        bool _notifyReceiver,
        TvmCell _payload,
        address[] _roots,
        uint32,
        address _remainingGasTo
    ) external override onlyPair(_roots) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        emit PairTransferTokensV2(
            _vaultWallet,
            _amount,
            _roots,
            _recipientAddress
        );

        ITokenWallet(_vaultWallet)
            .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _amount,
                _recipientAddress,
                _deployWalletGrams,
                _remainingGasTo,
                _notifyReceiver,
                _payload
            );
    }

    function _buildLpTokenPendingInitData(
        uint32 nonce,
        address pool,
        address[] roots
    ) private view returns (TvmCell) {
        return tvm.buildStateInit({
            contr: DexVaultLpTokenPendingV2,
            varInit: {
                _nonce: nonce,
                vault: address(this),
                pool: pool,
                roots: roots
            },
            pubkey: 0,
            code: _lpTokenPendingCode
        });
    }

    function upgrade(TvmCell code) public override onlyOwner {
        require(msg.value > DexGas.UPGRADE_VAULT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        emit VaultCodeUpgraded();

        TvmBuilder builder;
        TvmBuilder owners_data_builder;

        owners_data_builder.store(_owner);
        owners_data_builder.store(_pendingOwner);

        builder.store(_root);
        builder.store(_tokenFactory);

        builder.storeRef(owners_data_builder);

        builder.store(platform_code);
        builder.store(_lpTokenPendingCode);

        tvm.setcode(code);
        tvm.setCurrentCode(code);

        onCodeUpgrade(builder.toCell());
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

        // Refund remaining gas
        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function resetGas(address receiver) override external view onlyOwner {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        receiver.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function resetTargetGas(
        address target,
        address receiver
    ) external view onlyOwner {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        IResetGas(target)
            .resetGas{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (receiver);
    }

    function onAcceptTokensMint(
        address tokenRoot,
        uint128 amount,
        address remainingGasTo,
        TvmCell payload
    ) override external {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        TvmSlice payloadSlice = payload.toSlice();

        address lpVaultWallet = payloadSlice.decode(address);
        require(msg.sender.value != 0 && msg.sender == lpVaultWallet, DexErrors.NOT_LP_VAULT_WALLET);

        TvmCell exchangeData = payloadSlice.loadRef();

        (uint64 id,
        uint32 currentVersion,
        uint8 currentType,
        address[] roots,
        address senderAddress,
        address recipient,
        uint128 deployWalletGrams,
        NextExchangeData[] nextSteps) = abi.decode(exchangeData, (uint64, uint32, uint8, address[], address, address, uint128, NextExchangeData[]));

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

        bool needCancel = false;

        uint256 denominator = 0;
        uint32 msgValueDenominator = 0;
        address prevPool = _expectedPairAddress(roots);

        for (NextExchangeData nextStep: nextSteps) {
            if (nextStep.poolRoot.value == 0 || nextStep.poolRoot == prevPool ||
                nextStep.numerator == 0 || nextStep.msgValueNumerator == 0) {

                needCancel = true;
            }
            denominator += nextStep.numerator;
            msgValueDenominator += nextStep.msgValueNumerator;
        }

        if (!needCancel && nextSteps.length > 0) {
            for (NextExchangeData nextStep: nextSteps) {
                uint128 value = math.muldiv(msg.value, nextStep.msgValueNumerator, msgValueDenominator);
                uint128 nextPoolAmount = uint128(math.muldiv(amount, nextStep.numerator, denominator));

                IDexBasePool(nextStep.poolRoot).crossPoolExchange{
                    value: value,
                    flag: 0
                }(
                    id,

                    currentVersion,
                    currentType,

                    roots,

                    DexOperationTypes.CROSS_PAIR_EXCHANGE_V2,
                    tokenRoot,
                    nextPoolAmount,

                    senderAddress,
                    recipient,

                    remainingGasTo,
                    deployWalletGrams,

                    nextStep.payload,
                    notifySuccess,
                    successPayload,
                    notifyCancel,
                    cancelPayload
                );
            }
        } else {
            emit PairTransferTokensV2(
                lpVaultWallet,
                amount,
                roots,
                recipient
            );

            ITokenWallet(lpVaultWallet)
                .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    amount,
                    recipient,
                    deployWalletGrams,
                    remainingGasTo,
                    true,
                    successPayload
                );
        }
    }

    function burn(
        address[] _roots,
        address _lpVaultWallet,
        uint128 _amount,
        address _remainingGasTo,
        address _callbackTo,
        TvmCell _payload
    ) external override onlyPair(_roots) {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2);

        IBurnableTokenWallet(_lpVaultWallet).burn{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }(
            _amount,
            _remainingGasTo,
            _callbackTo,
            _payload
        );
    }
}
