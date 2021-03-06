pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/EverToTip3Gas.sol";
import "./libraries/EverToTip3Errors.sol";
import "./libraries/EverToTip3Payloads.sol";
import "./libraries/DexOperationTypes.sol";
import "./libraries/EverToTip3OperationStatus.sol";

import "./structures/ITokenOperationStructure.sol";

import "./interfaces/IEverVault.sol";
import "./interfaces/IEverTip3SwapEvents.sol";
import "./interfaces/IEverTip3SwapCallbacks.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensMintCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensBurnCallback.sol";

contract EverToTip3 is IAcceptTokensMintCallback, IAcceptTokensTransferCallback, IAcceptTokensBurnCallback, IEverTip3SwapEvents {

    uint32 static randomNonce_;

    address static public weverRoot;
    address static public weverVault;

    address public weverWallet;

    constructor() public {
        tvm.accept();

        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        ITokenRoot(weverRoot).deployWallet {
            value: EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: EverToTip3.onWeverWallet
        }(
            address(this),
            EverToTip3Gas.DEPLOY_EMPTY_WALLET_GRAMS
        );

        msg.sender.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
    }

    // Callback deploy WEVER wallet for contract
    function onWeverWallet(address _weverWallet) external {
        require(msg.sender.value != 0 && msg.sender == weverRoot, EverToTip3Errors.NOT_WEVER_ROOT);
        weverWallet = _weverWallet;
        weverWallet.transfer(0, false, MsgFlag.REMAINING_GAS + MsgFlag.IGNORE_ERRORS);
    }

    // Payload constructor swap Ever -> Tip-3
    function buildExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount
    ) external pure returns (TvmCell) {
        return EverToTip3Payloads.buildExchangePayload(pair, id, deployWalletValue, expectedAmount, 0);
    }

    // Payload constructor swap Ever -> Tip-3 via cross-pair
    function buildCrossPairExchangePayload(
        address pair,
        uint64 id,
        uint128 deployWalletValue,
        uint128 expectedAmount,
        ITokenOperationStructure.TokenOperation[] steps
    ) external pure returns (TvmCell) {
        return EverToTip3Payloads.buildCrossPairExchangePayload(pair, id, deployWalletValue, expectedAmount, steps, 0);
    }

    struct DecodedMintPayload {
        address pair;
        uint8 operationType;
        uint64 id;
        TvmCell ref1;
    }

    function _decodeMintPayload(TvmCell payload) internal pure returns (optional(DecodedMintPayload)) {
        optional(DecodedMintPayload) result;

        TvmSlice payloadSlice = payload.toSlice();
        if ((payloadSlice.bits() == 267 || payloadSlice.bits() == 395) && payloadSlice.refs() == 1) {
            address pair = payloadSlice.decode(address);
            TvmCell ref1 = payloadSlice.loadRef();
            TvmSlice ref1Slice = ref1.toSlice();

            if (ref1Slice.bits() >= 72) {
                uint8 operationType = ref1Slice.decode(uint8);
                uint64 id = ref1Slice.decode(uint64);

                if (
                    (
                        ref1Slice.bits() == (328 - 72) &&
                        ref1Slice.refs() == 2 &&
                        operationType == DexOperationTypes.EXCHANGE
                    ) || (
                        ref1Slice.bits() == (595 - 72) &&
                        ref1Slice.refs() == 3 &&
                        operationType == DexOperationTypes.CROSS_PAIR_EXCHANGE
                    )
                ) {
                    result.set(DecodedMintPayload(
                        pair,
                        operationType,
                        id,
                        ref1
                    ));
                }
            }
        }

        return result;
    }

    // Callback Mint token to weverWallet contract
    function onAcceptTokensMint(
        address /*tokenRoot*/,
        uint128 amount,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == weverWallet, EverToTip3Errors.NOT_WEVER_WALLET);
        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        optional(DecodedMintPayload) decodedOpt = _decodeMintPayload(payload);

        if (decodedOpt.hasValue()) {
            DecodedMintPayload decoded = decodedOpt.get();

            emit SwapEverToTip3Start(decoded.pair, decoded.operationType, decoded.id, user);

            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                decoded.pair,
                uint128(0),
                user,
                true,
                decoded.ref1
            );
        } else {
            TvmBuilder unwrapPayload;
            unwrapPayload.store(uint64(404));

            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                weverVault,
                uint128(0),
                user,
                true,
                unwrapPayload.toCell()
            );
        }
    }

    //Callback result swap or partial cross-swap
    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address /*senderWallet*/,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0);
        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        uint8 operationStatus = EverToTip3OperationStatus.UNKNOWN;
        uint64 id = 404;
        uint128 deployWalletValue = 0.1 ever;

        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() == 200) {
            (operationStatus, id, deployWalletValue) = payloadSlice.decode(uint8, uint64, uint128);
        }

        TvmBuilder payloadID_;
        payloadID_.store(id);

        if (msg.sender == weverWallet) {
            // Burn WEVER for user
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                weverVault,
                uint128(0),
                user,
                true,
                payloadID_.toCell()
            );
        } else if (operationStatus == EverToTip3OperationStatus.CANCEL) {
            emit SwapEverToTip3Partial(user, id, amount, tokenRoot);

            IEverTip3SwapCallbacks(user).onSwapEverToTip3Partial{
                value: 0,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(id, amount, tokenRoot);

            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                user,
                deployWalletValue,
                user,
                true,
                payloadID_.toCell()
            );
        } else if (operationStatus == EverToTip3OperationStatus.SUCCESS) {
            IEverTip3SwapCallbacks(user).onSwapEverToTip3Success{
                value: 0,
                flag: MsgFlag.SENDER_PAYS_FEES,
                bounce: false
            }(id, amount, tokenRoot);

            emit SwapEverToTip3Success(user, id, amount, tokenRoot);

            // Send TIP-3 token user
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                user,
                deployWalletValue,
                user,
                true,
                payloadID_.toCell()
            );
        } else {
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                user,
                sender != user ? 0.1 ever : 0,
                user,
                true,
                payloadID_.toCell()
            );
        }
    }

    // Callback Burn token if result swap cancel
    function onAcceptTokensBurn(
        uint128 amount,
        address /*walletOwner*/,
        address /*wallet*/,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == weverRoot, EverToTip3Errors.NOT_WEVER_ROOT);
        tvm.rawReserve(EverToTip3Gas.TARGET_BALANCE, 0);

        uint64 id = 404;

        TvmSlice payloadSlice = payload.toSlice();
        if (payloadSlice.bits() >= 64) {
            id = payloadSlice.decode(uint64);
        }

        emit SwapEverToTip3Cancel(user, id, amount);
        IEverTip3SwapCallbacks(user).onSwapEverToTip3Cancel{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(id, amount);
    }

    fallback() external pure {  }
}
