pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/EverToTip3Gas.sol";
import "./libraries/SwapEverErrors.sol";

import "./interfaces/IEverVault.sol";
import "./interfaces/ISwapEver.sol";
import "./interfaces/IEverTIP3SwapEvents.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol";
import "ton-eth-bridge-token-contracts/contracts/interfaces/IAcceptTokensTransferCallback.sol";

contract EverWEverToTIP3 is IAcceptTokensTransferCallback, IAcceptTokensBurnCallback {

    uint32 static _nonce;

    address wEverRoot_;
    address wEverWallet_;
    address wEverVault_;
    address swapEver_;

    constructor(address _wEverRoot, address _wEverVault, address _swapEver) public {
        tvm.accept();
        wEverRoot_ = _wEverRoot;
        wEverVault_ = _wEverVault;
        swapEver_ = _swapEver;
        
        tvm.rawReserve(EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE, 0);
        ITokenRoot(wEverRoot_).deployWallet{
            value: EverToTip3Gas.DEPLOY_EMPTY_WALLET_VALUE,
            flag: MsgFlag.SENDER_PAYS_FEES,
            callback: EverWEverToTIP3.onWEverWallet
        }(
            address(this),
            EverToTip3Gas.DEPLOY_EMPTY_WALLET_GRAMS
        );
    }
        
    // Callback deploy WEVER wallet for contract
    function onWEverWallet(address _wEverWallet) {
        require(msg.sender.value() != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        wEverWallet_ = _wEverWallet;
    }

    function buildEverWEverPayload(
        uint64 id,
        uint128 amount,
        address pair,
        uint128 expectedAmount,
        uint128 deployWalletValue
    ) external pure returns (TvmCell) {
        TvmBuilder builderPayload;
        builderPayload.store(id);
        builderPayload.store(amount);
        builderPayload.store(pair);
        builderPayload.store(expectedAmount);
        builderPayload.store(user);
        return builderPayload.toCell();
    }

     //Callback  
    function onAcceptTokensTransfer(
        address tokenRoot,
        uint128 amount,
        address sender,
        address senderWallet,
        address user,
        TvmCell payload
    ) override external {
        TvmSlice payloadSlice = payload.toSlice();
        bool needCancel;
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0);
        
        if ((payloadSlice.bits() == 854) && 
            (msg.sender.value != 0 && msg.sender == wEverWallet_) && 
            (msg.value >= (amount + EverToTip3Gas.GAS_SWAP))) {
                ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                    amount,
                    wEverVault_,
                    0,
                    user,
                    true,
                    payload
                );
        } else {
            needCancel = true;
        }

        if (needCancel) {
            TvmCell emptyPayload;
            ITokenWallet(msg.sender).transfer{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED, bounce: false }(
                amount,
                user,
                0,
                user,
                false,
                emptyPayload  
            );    
        }
    } 

    // Callback Burn token
    function onAcceptTokensBurn(
        uint128 amount,
        address walletOwner,
        address wallet,
        address user,
        TvmCell payload
    ) override external {
        require(msg.sender.value != 0 && msg.sender == wEverRoot_, SwapEverErrors.NOT_ROOT_WEVER);
        tvm.rawReserve(EverToTip3Gas.ACCOUNT_INITIAL_BALANCE, 0); 
          
        emit UnwrapWEverToEver(user, id);
        ISwapEver(swapEver_).swapEvers{ value: 0, flag: MsgFlag.SENDER_PAYS_FEES, bounce: false }(
            user,
            payload
        );
    }
}