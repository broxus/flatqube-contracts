pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import 'ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol';
import 'ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol';
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

import "./interfaces/IUpgradableByRequest.sol";
import "./interfaces/IDexRoot.sol";
import "./interfaces/IDexAccount.sol";
import "./interfaces/IDexPair.sol";
import "./interfaces/IDexVault.sol";
import "./interfaces/IResetGas.sol";
import "./interfaces/IDexAccountOwner.sol";

import "./libraries/DexPlatformTypes.sol";
import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";

import "./abstract/DexContractBase.sol";

import "./DexPlatform.sol";

contract DexAccount is
    DexContractBase,
    IDexAccount,
    IAcceptTokensTransferCallback,
    IUpgradableByRequest,
    IResetGas
{
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Data:

    // Base:
    address root;
    address vault;
    uint32 current_version;

    // Params:
    address owner;

    // Custom:
    // root -> wallet
    mapping(address => address) _wallets;
    // root -> balance
    mapping(address => uint128) _balances;

    // Operations temporary data:
    // call_id -> Operation[]
    mapping(uint64 => Operation) _tmp_operations;
    // token_root -> send_gas_to
    mapping(address => address) _tmp_deploying_wallets;
    // token_root -> (call_id, recipient_address, deploy_wallet_grams)
    mapping(address => WithdrawalParams) _tmp_withdrawals;

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Modifiers

    modifier onlyOwner() {
        require(owner.value != 0 && msg.sender == owner, DexErrors.NOT_MY_OWNER);
        _;
    }

    modifier onlyRoot() {
        require(root.value != 0 && msg.sender == root, DexErrors.NOT_ROOT);
        _;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Base functions

    // Cant be deployed directly
    constructor() public {
        revert();
    }

    function _dexRoot() override internal view returns(address) {
        return root;
    }

    // Prevent manual transfers
    receive() external pure {
        revert();
    }

    // Prevent undefined functions call, need for bounce future Pair/Root functions calls, when not upgraded
    fallback() external pure {
        revert();
    }

    // ...and allow user to get surplus gas
    function resetGas(address receiver) override external view onlyOwner {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        receiver.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED,
            bounce: false
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Getters

    function getRoot() override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } root;
    }

    function getOwner() override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } owner;
    }

    function getVersion() override external view responsible returns (uint32) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } current_version;
    }

    function getVault() override external view responsible returns (address) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } vault;
    }

    function getWalletData(address token_root)
        override
        external
        view
        responsible
        returns (address wallet, uint128 balance)
    {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } (
            _wallets.exists(token_root) ? _wallets.at(token_root) : address.makeAddrStd(0, 0),
            _balances.exists(token_root) ? _balances.at(token_root) : 0
        );
    }

    function getWallets() external view returns (mapping(address => address)) {
        return _wallets;
    }

    function getBalances() external view returns (mapping(address => uint128)) {
        return _balances;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Deposit

    function onAcceptTokensTransfer(
        address _tokenRoot,
        uint128 _tokensAmount,
        address /* sender_address */,
        address _senderWallet,
        address _originalGasTo,
        TvmCell _payload
    ) override external {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        TvmSlice payloadSlice = _payload.toSlice();
        bool notifyCancel = payloadSlice.refs() >= 1;
        TvmCell cancelPayload;

        if (notifyCancel) {
            cancelPayload = payloadSlice.loadRef();
        }

        if (
            _wallets.exists(_tokenRoot) &&
            msg.sender == _wallets[_tokenRoot]
        ) {
            if(_balances.exists(_tokenRoot)) {
                _balances[_tokenRoot] += _tokensAmount;
            } else {
                _balances[_tokenRoot] = _tokensAmount;
            }

            emit TokensReceived(
                _tokenRoot,
                _tokensAmount,
                _balances[_tokenRoot],
                _senderWallet
            );

            TvmCell empty;

            ITokenWallet(msg.sender)
                .transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    _tokensAmount,
                    vault,                      // recipient_address
                    0,                          // deploy_grams
                    _originalGasTo,
                    false,                      // notify_receiver
                    empty
                );
        } else {
            ITokenWallet(msg.sender)
                .transferToWallet{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
                (
                    _tokensAmount,
                    _senderWallet,
                    _originalGasTo,
                    notifyCancel,
                    cancelPayload
                );
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Withdraw

    function withdraw(
        uint64  call_id,
        uint128 amount,
        address token_root,
        address recipient_address,
        uint128 deploy_wallet_grams,
        address send_gas_to
    ) override external onlyOwner {
        require(!_tmp_operations.exists(call_id), DexErrors.OPERATION_ALREADY_IN_PROGRESS);
        require(!_tmp_withdrawals.exists(token_root), DexErrors.ANOTHER_WITHDRAWAL_IN_PROGRESS);
        require(amount > 0, DexErrors.AMOUNT_TOO_LOW);
        require(recipient_address.value != 0, DexErrors.WRONG_RECIPIENT);
        require(msg.value >= DexGas.WITHDRAW_MIN_VALUE_BASE + deploy_wallet_grams, DexErrors.VALUE_TOO_LOW);
        require(_wallets.exists(token_root) && _balances.exists(token_root), DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_balances[token_root] >= amount, DexErrors.NOT_ENOUGH_FUNDS);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        _balances[token_root] -= amount;

        emit WithdrawTokens(token_root, amount, _balances[token_root]);

        address send_gas_to_ = send_gas_to.value == 0 ? owner : send_gas_to;

        _tmp_operations[call_id] = Operation(
            [TokenOperation(amount, token_root)],
            send_gas_to_,
            vault
        );

        _tmp_withdrawals[token_root] = WithdrawalParams(
            call_id,
            recipient_address,
            deploy_wallet_grams
        );

        ITokenRoot(token_root)
            .walletOf{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED,
                callback: DexAccount.onVaultTokenWallet
            }(vault);
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Transfers

    function transfer(
        uint64  call_id,
        uint128 amount,
        address token_root,
        address recipient,
        bool    willing_to_deploy,
        address send_gas_to
    ) override external onlyOwner {
        require(!_tmp_operations.exists(call_id), DexErrors.OPERATION_ALREADY_IN_PROGRESS);
        require(amount > 0, DexErrors.AMOUNT_TOO_LOW);
        require(msg.value >= DexGas.TRANSFER_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_wallets.exists(token_root) && _balances.exists(token_root), DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_balances[token_root] >= amount, DexErrors.NOT_ENOUGH_FUNDS);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        _balances[token_root] -= amount;

        emit TransferTokens(token_root, amount, _balances[token_root]);

        address send_gas_to_ = send_gas_to.value == 0 ? owner : send_gas_to;

        address recipient_dex_account = address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Account,
                    _buildAccountParams(recipient)
                )
            )
        );

        _tmp_operations[call_id] = Operation(
            [TokenOperation(amount, token_root)],
            send_gas_to_,
            recipient_dex_account
        );

        IDexAccount(recipient_dex_account)
            .internalAccountTransfer{ value: 0, bounce: true, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                call_id,
                amount,
                token_root,
                owner,
                willing_to_deploy,
                send_gas_to_
            );
    }

    function internalAccountTransfer(
        uint64 call_id,
        uint128 amount,
        address token_root,
        address sender_owner,
        bool    willing_to_deploy,
        address send_gas_to
    ) override external onlyAccount(sender_owner) {
        require(
            willing_to_deploy ||
            _wallets.exists(token_root) ||
            _tmp_deploying_wallets.exists(token_root),
            DexErrors.UNKNOWN_TOKEN_ROOT
        );

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        if(_balances.exists(token_root)) {
            _balances[token_root] += amount;
        } else {
            _balances[token_root] = amount;
        }

        emit TokensReceivedFromAccount(
            token_root,
            amount,
            _balances[token_root],
            sender_owner
        );

        if (
            willing_to_deploy &&
            !_wallets.exists(token_root) &&
            !_tmp_deploying_wallets.exists(token_root)
        ) {
            _deployWallet(token_root, send_gas_to);
        }

        IDexAccount(msg.sender)
            .successCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (call_id);
    }

    function internalPairTransfer(
        uint128 amount,
        address token_root,
        address sender_left_root,
        address sender_right_root,
        address send_gas_to
    ) override external onlyPair([sender_left_root, sender_right_root]) {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        if(_balances.exists(token_root)) {
            _balances[token_root] += amount;
        } else {
            _balances[token_root] = amount;
        }

        emit TokensReceivedFromPair(
            token_root,
            amount,
            _balances[token_root],
            sender_left_root,
            sender_right_root
        );

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function internalPoolTransfer(
        uint128 _amount,
        address _tokenRoot,
        address[] _roots,
        address _remainingGasTo
    ) override external onlyPair(_roots) {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        if(_balances.exists(_tokenRoot)) {
            _balances[_tokenRoot] += _amount;
        } else {
            _balances[_tokenRoot] = _amount;
        }

        emit TokensReceivedFromPairV2(
            _tokenRoot,
            _amount,
            _balances[_tokenRoot],
            _roots
        );

        _remainingGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Pair operations

    function exchange(
        uint64  call_id,
        uint128 spent_amount,
        address spent_token_root,
        address receive_token_root,
        uint128 expected_amount,
        address send_gas_to
    ) override external onlyOwner {
        _exchangeInternal(
            call_id,
            TokenOperation(spent_amount, spent_token_root),
            TokenOperation(expected_amount, receive_token_root),
            [spent_token_root, receive_token_root],
            send_gas_to
        );
    }

    function exchangeV2(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation _expected,
        address[] _roots,
        address _remainingGasTo
    ) override external onlyOwner {
        _exchangeInternal(
            _callId,
            _operation,
            _expected,
            _roots,
            _remainingGasTo
        );
    }

    function _exchangeInternal(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation _expected,
        address[] _roots,
        address _remainingGasTo
    ) private {
        require(!_tmp_operations.exists(_callId), DexErrors.OPERATION_ALREADY_IN_PROGRESS);
        require(_operation.amount > 0, DexErrors.AMOUNT_TOO_LOW);
        require(msg.value >= DexGas.EXCHANGE_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_wallets.exists(_operation.root) && _balances.exists(_operation.root), DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_wallets.exists(_expected.root), DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_balances[_operation.root] >= _operation.amount, DexErrors.NOT_ENOUGH_FUNDS);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        address pair = address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Pool,
                    _buildPairParams(_roots)
                )
            )
        );

        _balances[_operation.root] -= _operation.amount;

        emit ExchangeTokens(
            _operation.root,
            _expected.root,
            _operation.amount,
            _expected.amount,
            _balances[_operation.root]
        );

        address remainingGasTo = _remainingGasTo.value == 0 ? owner : _remainingGasTo;

        _tmp_operations[_callId] = Operation(
            [_operation],
            remainingGasTo,
            pair
        );

        IDexPair(pair)
            .exchange{ value: 0, bounce: true, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _callId,
                _operation,
                _expected,
                owner,
                current_version,
                remainingGasTo
            );
    }

    function depositLiquidity(
        uint64  call_id,
        address left_root,
        uint128 left_amount,
        address right_root,
        uint128 right_amount,
        address expected_lp_root,
        bool    auto_change,
        address send_gas_to
    ) override external onlyOwner {
        _depositLiquidityInternal(
            call_id,
            [TokenOperation(left_amount, left_root), TokenOperation(right_amount, right_root)],
            TokenOperation(0, expected_lp_root),
            auto_change,
            send_gas_to
        );
    }

    function depositLiquidityV2(
        uint64 _callId,
        TokenOperation[] _operations,
        TokenOperation _expected,
        bool _autoChange,
        address _remainingGasTo
    ) override external onlyOwner {
        _depositLiquidityInternal(
            _callId,
            _operations,
            _expected,
            _autoChange,
            _remainingGasTo
        );
    }

    function _depositLiquidityInternal(
        uint64 _callId,
        TokenOperation[] _operations,
        TokenOperation _expected,
        bool _autoChange,
        address _remainingGasTo
    ) private {
        require(!_tmp_operations.exists(_callId), DexErrors.OPERATION_ALREADY_IN_PROGRESS);
        require(_operations.length > 1, DexErrors.WRONG_PAIR);
        require(msg.value >= DexGas.DEPOSIT_LIQUIDITY_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_wallets.exists(_expected.root) && _balances.exists(_expected.root), DexErrors.UNKNOWN_TOKEN_ROOT);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        address[] roots;

        for (TokenOperation operation : _operations) {
            roots.push(operation.root);
            _balances[operation.root] -= operation.amount;
        }

        address pair = address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Pool,
                    _buildPairParams(roots)
                )
            )
        );

        emit DepositLiquidity(_operations, _autoChange);

        address remainingGasTo = _remainingGasTo.value == 0 ? owner : _remainingGasTo;

        _tmp_operations[_callId] = Operation(
            _operations,
            remainingGasTo,
            pair
        );

        IDexPair(pair)
            .depositLiquidity{ value: 0, bounce: true, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _callId,
                _operations,
                _expected,
                _autoChange,
                owner,
                current_version,
                remainingGasTo
            );
    }

    function withdrawLiquidity(
        uint64  call_id,
        uint128 lp_amount,
        address lp_root,
        address left_root,
        address right_root,
        address send_gas_to
    ) override external onlyOwner {
        _withdrawLiquidityInternal(
            call_id,
            TokenOperation(lp_amount, lp_root),
            [TokenOperation(0, left_root), TokenOperation(0, right_root)],
            send_gas_to
        );
    }

    function withdrawLiquidityV2(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation[] _expected,
        address _remainingGasTo
    ) override external onlyOwner {
        _withdrawLiquidityInternal(
            _callId,
            _operation,
            _expected,
            _remainingGasTo
        );
    }

    function _withdrawLiquidityInternal(
        uint64 _callId,
        TokenOperation _operation,
        TokenOperation[] _expected,
        address _remainingGasTo
    ) private {
        require(!_tmp_operations.exists(_callId), DexErrors.OPERATION_ALREADY_IN_PROGRESS);
        require(_operation.amount > 0, DexErrors.AMOUNT_TOO_LOW);
        require(msg.value >= DexGas.WITHDRAW_LIQUIDITY_MIN_VALUE, DexErrors.VALUE_TOO_LOW);
        require(_wallets.exists(_operation.root) && _balances.exists(_operation.root), DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_expected.length > 1, DexErrors.UNKNOWN_TOKEN_ROOT);
        require(_balances[_operation.root] >= _operation.amount, DexErrors.NOT_ENOUGH_FUNDS);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        address[] roots;

        for (TokenOperation operation : _expected) {
            roots.push(operation.root);
        }

        address pair = address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Pool,
                    _buildPairParams(roots)
                )
            )
        );

        _balances[_operation.root] -= _operation.amount;

        emit WithdrawLiquidity(
            _operation.amount,
            _balances[_operation.root],
            _operation.root,
            roots
        );

        address remainingGasTo = _remainingGasTo.value == 0 ? owner : _remainingGasTo;

        _tmp_operations[_callId] = Operation(
            [_operation],
            remainingGasTo,
            pair
        );

        IDexPair(pair)
            .withdrawLiquidity{ value: 0, bounce: true, flag: MsgFlag.ALL_NOT_RESERVED }
            (
                _callId,
                _operation,
                _expected,
                owner,
                current_version,
                remainingGasTo
            );
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Add wallets flow

    function addPair(
        address left_root,
        address right_root
    ) override external onlyOwner {
        _addPoolInternal([left_root, right_root]);
    }

    function addPool(address[] _roots) override external onlyOwner {
        _addPoolInternal(_roots);
    }

    function _addPoolInternal(address[] _roots) private {
        require(_roots.length > 1, DexErrors.WRONG_PAIR);
        require(msg.value >= DexGas.ADD_PAIR_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        address expected = address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Pool,
                    _buildPairParams(_roots)
                )
            )
        );

        emit AddPool(_roots, expected);

        IDexPair(expected)
            .checkPair{ value: 0, bounce: true, flag: MsgFlag.ALL_NOT_RESERVED }
            (owner, current_version);
    }

    function checkPoolCallback(
        address[] _roots,
        address _lpRoot
    ) override external onlyPair(_roots) {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        for (address tokenRoot : _roots) {
            if (!_wallets.exists(tokenRoot)) {
                _deployWallet(tokenRoot, owner);
            }
        }

        if (!_wallets.exists(_lpRoot)) {
            _deployWallet(_lpRoot, owner);
        }

        owner.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function _deployWallet(
        address _tokenRoot,
        address _sendGasTo
    ) private {
        _tmp_deploying_wallets[_tokenRoot] = _sendGasTo;

        ITokenRoot(_tokenRoot)
            .deployWallet{
                value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: DexAccount.onTokenWallet
            }(
                address(this),                  // owner_address
                DexGas.DEPLOY_EMPTY_WALLET_GRAMS   // deploy_grams
            );
    }

    // callback for ITokenRoot(...).walletOf
    function onTokenWallet(address wallet) external {
        require(
            _tmp_deploying_wallets.exists(msg.sender) &&
            !_wallets.exists(msg.sender),
            DexErrors.TODO
        );

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 2);

        address send_gas_to = _tmp_deploying_wallets[msg.sender];

        _wallets[msg.sender] = wallet;

        if(!_balances.exists(msg.sender)) {
            _balances[msg.sender] = 0;
        }

        delete _tmp_deploying_wallets[msg.sender];

        send_gas_to.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function onVaultTokenWallet(address wallet) external {
        require(_wallets.exists(msg.sender) && _tmp_withdrawals.exists(msg.sender), DexErrors.TODO);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        WithdrawalParams w = _tmp_withdrawals[msg.sender];

        Operation operation = _tmp_operations[w.call_id];

        if (operation.expected_callback_sender == vault && operation.token_operations[0].root == msg.sender) {
            delete _tmp_withdrawals[msg.sender];

            IDexVault(vault)
                .withdraw{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: true }
                (
                    w.call_id,
                    operation.token_operations[0].amount,
                    operation.token_operations[0].root,
                    wallet,
                    w.recipient_address,
                    w.deploy_wallet_grams,
                    owner,
                    current_version,
                    operation.send_gas_to
                );
        } else {
            operation.send_gas_to.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
            });
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Code upgrade
    function requestUpgrade(address send_gas_to) external view onlyOwner {
        require(msg.value >= DexGas.UPGRADE_ACCOUNT_MIN_VALUE, DexErrors.VALUE_TOO_LOW);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        emit CodeUpgradeRequested();

        IDexRoot(root)
            .requestUpgradeAccount{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (current_version, owner, send_gas_to);
    }

    function upgrade(
        TvmCell _code,
        uint32 _newVersion,
        address _sendGasTo
    ) override external onlyRoot {
        if (current_version == _newVersion) {
            tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

            _sendGasTo.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
            });
        } else {
            emit AccountCodeUpgraded(_newVersion);

            TvmBuilder builder;

            builder.store(root);
            builder.store(vault);
            builder.store(current_version);
            builder.store(_newVersion);
            builder.store(_sendGasTo);
            builder.store(platform_code);  // ref1 = platform_code

            TvmBuilder dataBuilder;        // ref2:
            dataBuilder.store(owner);      //   owner
            dataBuilder.store(_wallets);   //   _wallets
            dataBuilder.store(_balances);  //   _balances
            builder.storeRef(dataBuilder);

            TvmBuilder tmpBuilder;        // ref3:
            tmpBuilder.store(_tmp_operations);
            tmpBuilder.store(_tmp_deploying_wallets);
            tmpBuilder.store(_tmp_withdrawals);
            builder.storeRef(tmpBuilder);

            // set code after complete this method
            tvm.setcode(_code);
            tvm.setCurrentCode(_code);

            onCodeUpgrade(builder.toCell());
        }
    }

    /*
        upgrade_data
            bits:
                uint32 old_version - zero if initialize
                uint32 new_version
                address root
                address send_gas_to
            refs:
                1: platform_code
                2: data
                    bits:
                        address owner
                        [mapping(address => address) _wallets]
                        [mapping(address => uint128) _balances]
    */
    function onCodeUpgrade(TvmCell _data) private {
        TvmSlice s = _data.toSlice();

        (
            address _root,
            address _vault,
            uint32 _oldVersion,
            uint32 _newVersion,
            address _sendGasTo
        ) = s.decode(
            address,
            address,
            uint32,
            uint32,
            address
        );

        if (_oldVersion == 0) {
            tvm.resetStorage();
        }

        root = _root;
        vault = _vault;
        current_version = _newVersion;
        platform_code = s.loadRef();        // ref 1
        TvmSlice data = s.loadRefAsSlice(); // ref 2
        owner = data.decode(address);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        _sendGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
            bounce: false
        });
    }

    // success
    function successCallback(uint64 _callId) override external {
        require(_tmp_operations.exists(_callId), DexErrors.INVALID_CALLBACK);
        Operation operation = _tmp_operations[_callId];
        require(operation.expected_callback_sender == msg.sender, DexErrors.INVALID_CALLBACK_SENDER);

        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        delete _tmp_operations[_callId];

        if (operation.send_gas_to == owner) {
            IDexAccountOwner(owner)
                .dexAccountOnSuccess{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(_callId);
        } else {
            IDexAccountOwner(owner)
                .dexAccountOnSuccess{
                    value: DexGas.OPERATION_CALLBACK_BASE,
                    flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS
                }(_callId);

            operation.send_gas_to.transfer({
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                bounce: false
            });
        }
    }

    // onBounce
    onBounce(TvmSlice _body) external {
        tvm.rawReserve(DexGas.ACCOUNT_INITIAL_BALANCE, 0);

        uint32 functionId = _body.decode(uint32);

        if (
            functionId == tvm.functionId(IDexPair.exchange) ||
            functionId == tvm.functionId(IDexPair.depositLiquidity) ||
            functionId == tvm.functionId(IDexAccount.internalAccountTransfer) ||
            functionId == tvm.functionId(IDexVault.withdraw)
        ) {
            uint64 call_id = _body.decode(uint64);

            if (_tmp_operations.exists(call_id)) {
                Operation operation = _tmp_operations[call_id];

                delete _tmp_operations[call_id];

                for (TokenOperation op : operation.token_operations) {
                    _balances[op.root] += op.amount;

                    emit OperationRollback(
                        op.root,
                        op.amount,
                        _balances[op.root],
                        msg.sender
                    );
                }

                if (operation.send_gas_to == owner) {
                    IDexAccountOwner(owner)
                        .dexAccountOnBounce{
                            value: 0,
                            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(call_id, functionId);
                } else {
                    IDexAccountOwner(owner)
                        .dexAccountOnBounce{
                            value: DexGas.OPERATION_CALLBACK_BASE,
                            flag: MsgFlag.SENDER_PAYS_FEES + MsgFlag.IGNORE_ERRORS,
                            bounce: false
                        }(call_id, functionId);

                    operation.send_gas_to.transfer({
                        value: 0,
                        flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                        bounce: false
                    });
                }
            }
        } else if (functionId == tvm.functionId(IDexPair.checkPair)) {
            emit ExpectedPairNotExist(msg.sender);

            IDexAccountOwner(owner)
                .dexAccountOnBounce{
                    value: 0,
                    flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS,
                    bounce: false
                }(0, functionId);
        }
    }
}
