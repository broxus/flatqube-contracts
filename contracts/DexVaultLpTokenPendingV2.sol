pragma ton-solidity >= 0.57.0;

import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "./interfaces/ITokenFactory.sol";
import "./interfaces/IDexVault.sol";
import "./interfaces/ITokenRootDeployedCallback.sol";

import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITransferableOwnership.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITransferTokenRootOwnershipCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/structures/ICallbackParamsStructure.sol";


contract DexVaultLpTokenPendingV2 is ITokenRootDeployedCallback, ITransferTokenRootOwnershipCallback {

    string LP_TOKEN_SYMBOL_PREFIX = "FlatQube-LP-";
    string LP_TOKEN_SYMBOL_SEPARATOR = "-";
    uint8 LP_TOKEN_DECIMALS = 9;

    uint32 static _nonce;

    address static vault;
    address static pool;
    address[] static roots;
    mapping(address => uint8) token_index;

    address token_factory;

    address lp_token_root;

    uint128 deploy_value;
    address send_gas_to;

    bool need_to_terminate;
    uint8 pending_messages;

    string[] root_symbols;
    bool[] root_symbols_received;
    uint8 root_symbols_amt;

    uint8 N_COINS;

    modifier onlyVault {
        require(msg.sender == vault, DexErrors.NOT_VAULT);
        _;
    }

    modifier onlyTokenFactory {
        require(msg.sender == token_factory, DexErrors.NOT_TOKEN_FACTORY);
        _;
    }

    modifier onlyExpectedToken {
        require(isSenderExpectedToken(), DexErrors.NOT_EXPECTED_TOKEN);
        _;
    }

    constructor(address token_factory_, uint128 value_, address send_gas_to_) public onlyVault {
        token_factory = token_factory_;
        send_gas_to = send_gas_to_;
        deploy_value = value_;

        N_COINS = uint8(roots.length);

        root_symbols = new string[](N_COINS);
        root_symbols_received = new bool[](N_COINS);

        for (uint8 i = 0; i < N_COINS; i++) {
            token_index[roots[i]] = i;
        }

        for (uint8 i = 0; i < N_COINS; i++) {
            ITokenRoot(roots[i]).symbol{
                value: DexGas.GET_TOKEN_DETAILS_VALUE,
                flag: MsgFlag.SENDER_PAYS_FEES,
                callback: onSymbol
            }();
        }
        pending_messages+=N_COINS;
    }

    function terminate() public view {
        require(msg.sender == send_gas_to, DexErrors.NOT_MY_OWNER);
        tvm.accept();
        _onLiquidityTokenNotDeployed();
    }

    function onSymbol(string symbol) public onlyExpectedToken {
        pending_messages--;

        uint8 i = token_index[msg.sender];

        root_symbols[i] = symbol;
        if (!root_symbols_received[i]) {
            root_symbols_amt += 1;
            root_symbols_received[i] = true;

            if (root_symbols_amt == N_COINS) {
                createLpTokenAndWallets();
            }
        }
        terminateIfEmptyQueue();
    }

    function onTokenRootDeployed(
        uint32 /*answer_id*/,
        address token_root
    ) override public onlyTokenFactory {
        lp_token_root = token_root;
        deployEmptyWallet(token_root, vault);

        TvmCell empty;
        mapping(address => ICallbackParamsStructure.CallbackParams) callbacks;
        callbacks[address(this)] = ICallbackParamsStructure.CallbackParams(0, empty);
        ITransferableOwnership(token_root).transferOwnership{
            value: DexGas.TRANSFER_ROOT_OWNERSHIP_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(pool, address(this), callbacks);
    }

    function onTransferTokenRootOwnership(
        address oldOwner,
        address newOwner,
        address,
        TvmCell
    ) external override {
        require(msg.sender.value != 0 && msg.sender == lp_token_root, DexErrors.NOT_LP_TOKEN_ROOT);

        pending_messages--;

        if (oldOwner == address(this) && newOwner == pool) {
            IDexVault(vault).onLiquidityTokenDeployed{
                value: 0,
                flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
            }(_nonce, pool, roots, lp_token_root, send_gas_to);
        } else {
            _onLiquidityTokenNotDeployed();
        }
    }

    function _onLiquidityTokenNotDeployed() private inline view {
        IDexVault(vault).onLiquidityTokenNotDeployed{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.DESTROY_IF_ZERO
        }(_nonce, pool, roots, lp_token_root, send_gas_to);
    }

    function createLpTokenAndWallets() private {
        string lp_token_symbol = lpTokenSymbol(root_symbols);
        deployLpToken(lp_token_symbol, LP_TOKEN_DECIMALS);
        for (uint8 i = 0; i < N_COINS; i++) {
            deployEmptyWallet(roots[i], vault);
        }
    }

    function deployLpToken(bytes symbol, uint8 decimals) private {
        pending_messages++;
        ITokenFactory(token_factory).createToken{
            value: DexGas.CREATE_TOKEN_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES
        }(
            0,
            symbol,
            symbol,
            decimals,
            address(0),
            0,
            0,
            false,
            false,
            false,
            address(0)
        );
    }

    function deployEmptyWallet(address token_root, address wallet_owner) private {
        pending_messages++;
        ITokenRoot(token_root).deployWallet{
            value: DexGas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: DexVaultLpTokenPendingV2.onDeployWallet
        }(
            wallet_owner,                  /*owner_address*/
            DexGas.DEPLOY_EMPTY_WALLET_GRAMS  /*deploy_grams*/
        );
    }

    function onDeployWallet(address) external {
        require(isSenderExpectedToken() || msg.sender == lp_token_root, DexErrors.NOT_EXPECTED_TOKEN);
        pending_messages--;
    }

    function lpTokenSymbol(string[] symbols) private view returns (string) {
        string name = LP_TOKEN_SYMBOL_PREFIX;
        name.append(symbols[0]);
        for (uint8 i = 1; i < N_COINS; i++) {
            name.append(LP_TOKEN_SYMBOL_SEPARATOR);
            name.append(symbols[i]);
        }

        return name;
    }

    function isSenderExpectedToken() private view returns (bool) {
        for (uint8 i = 0; i < N_COINS; i++) {
            if (msg.sender == roots[i]) return true;
        }
        return false;
    }

    function terminateIfEmptyQueue() private inline view {
        if (pending_messages == 0) {
            _onLiquidityTokenNotDeployed();
        }
    }

    onBounce(TvmSlice /*body*/) external {
        if (isSenderExpectedToken() || msg.sender == token_factory || msg.sender == lp_token_root) {
            pending_messages--;
            terminateIfEmptyQueue();
        }
    }

    receive() external pure {}
}
