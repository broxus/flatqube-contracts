pragma ton-solidity >= 0.62.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "tip3/contracts/interfaces/ITokenWallet.sol";

import "./abstract/DexContractBase.sol";

import "./interfaces/IDexVault.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IReferralProgramCallbacks.sol";

import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "./libraries/DexOperationTypes.sol";

contract DexVault is DexContractBase, IDexVault {
    uint32 private static _nonce;

    address private _root;
    address private _owner;
    address private _pendingOwner;
    address private _manager;

    mapping(address => address) public _vaultWallets;

    // referral program
    ReferralProgramParams _refProgramParams;

    modifier onlyOwner() {
        require(msg.sender == _owner, DexErrors.NOT_MY_OWNER);
        _;
    }

    modifier onlyManagerOrOwner() {
        require(
            msg.sender.value != 0 &&
            (msg.sender == _owner || msg.sender == _manager),
            DexErrors.NOT_MY_OWNER
        );
        _;
    }

    constructor(address owner_, address root_) public {
        tvm.accept();

        _root = root_;
        _owner = owner_;
    }

    function installPlatformOnce(TvmCell code) external onlyOwner {
        require(platform_code.toSlice().empty(), DexErrors.PLATFORM_CODE_NON_EMPTY);

        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        platform_code = code;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
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

    function getOwner() external view override responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _owner;
    }

    function getPendingOwner() external view override responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _pendingOwner;
    }

    function getManager() external view override responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _manager;
    }

    function setManager(address _newManager) external override onlyOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 0);

        _manager = _newManager;

        msg.sender.transfer({
            value: 0,
            bounce: false,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function revokeManager() external override onlyManagerOrOwner {
        tvm.rawReserve(DexGas.ROOT_INITIAL_BALANCE, 0);

        _manager = address(0);

        msg.sender.transfer({
            value: 0,
            bounce: false,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function getRoot() external view override responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _root;
    }

    function getReferralProgramParams() external view override responsible returns (ReferralProgramParams) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _refProgramParams;
    }

    function setReferralProgramParams(ReferralProgramParams params) external override onlyOwner {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            2
        );

        _refProgramParams = params;

        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    // TODO: remove me in next version
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

    function upgrade(TvmCell code) public override onlyOwner {
        require(msg.value > DexGas.UPGRADE_VAULT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        emit VaultCodeUpgraded();

        TvmBuilder builder;

        builder.store(_root);

        TvmBuilder ownersDataBuilder;
        ownersDataBuilder.store(_owner);
        ownersDataBuilder.store(_pendingOwner);
        ownersDataBuilder.store(_manager);
        builder.storeRef(ownersDataBuilder);

        builder.store(platform_code);

        builder.store(abi.encode(_refProgramParams));

        tvm.setcode(code);
        tvm.setCurrentCode(code);

        onCodeUpgrade(builder.toCell());
    }

    function onCodeUpgrade(TvmCell _data) private {
        tvm.resetStorage();

        TvmSlice slice = _data.toSlice();

        (_root,) = slice.decode(address, address);

        TvmCell ownersData = slice.loadRef();
        TvmSlice ownersSlice = ownersData.toSlice();
        (_owner, _pendingOwner, _manager) = ownersSlice.decode(address, address, address);

        platform_code = slice.loadRef();

        //ignore _lpTokenPendingCode
        slice.loadRef();

        (, _vaultWallets)  = abi.decode(slice.loadRef(), (
            mapping(address => bool),
            mapping(address => address)
        ));

        // Refund remaining gas
        _owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    function resetGas(address receiver) external view override onlyOwner {
        tvm.rawReserve(DexGas.VAULT_INITIAL_BALANCE, 2);

        receiver.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED });
    }

    function resetTargetGas(
        address target,
        address receiver
    ) external view override onlyOwner {
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

    function onAcceptTokensTransfer(
        address _tokenRoot,
        uint128 _amount,
        address _sender,
        address /* _senderWallet */,
        address _remainingGasTo,
        TvmCell _payload
    ) external override {
        tvm.rawReserve(
            math.max(
                DexGas.VAULT_INITIAL_BALANCE,
                address(this).balance - msg.value
            ),
            0
        );

        TvmSlice payloadSlice = _payload.toSlice();
        optional(uint8) op = payloadSlice.decodeQ(uint8);

        if (
            op.hasValue() &&
            op.get() == DexOperationTypes.REFERRAL_FEE &&
            _sender == _expectedTokenVaultAddress(_tokenRoot) &&
            payloadSlice.refs() >= 1
        ) {
            (
                address[] _roots,
                address _referrer,
                address _referral
            ) = abi.decode(payloadSlice.loadRef(), (
                address[],
                address,
                address
            ));

            emit ReferralFeeTransfer({
                tokenRoot: _tokenRoot,
                vaultWallet: msg.sender,
                amount: _amount,
                roots: _roots,
                referrer: _referrer,
                referral: _referral
            });

            IReferralProgramCallbacks(_refProgramParams.projectAddress)
                .onRefLastUpdate{
                    value: DexGas.REFERRAL_PROGRAM_CALLBACK,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(_referral, _referrer, _referral);

            TvmCell refPayload = abi.encode(_refProgramParams.projectId, _referrer, _referral);

            ITokenWallet(msg.sender)
                .transfer{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED,
                    bounce: false
                }(
                    _amount,
                    _refProgramParams.systemAddress,
                    DexGas.DEPLOY_REFERRER_FEE_EMPTY_WALLET,
                    _remainingGasTo,
                    true,
                    refPayload
                );
        }
    }
}
