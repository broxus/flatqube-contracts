pragma ton-solidity >= 0.62.0;

interface IDexTokenVault {

    event TokenVaultCodeUpgraded();

    event WithdrawTokens(
        uint128 amount,
        address account_owner,
        address recipient_address
    );

    event PairTransferTokensV2(
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

    function withdraw(
        uint64 call_id,
        uint128 amount,
        address recipient_address,
        uint128 deploy_wallet_grams,
        address account_owner,
        uint32  account_version,
        address send_gas_to
    ) external;

    function getTokenRoot() external view responsible returns (address);

    function getTokenWallet() external view responsible returns (address);

//    FIXME:
//    function transfer(
//        uint128 amount,
//        address token_root,
//        address vault_wallet,
//        address recipient_address,
//        uint128 deploy_wallet_grams,
//        bool    notify_receiver,
//        TvmCell payload,
//        address left_root,
//        address right_root,
//        uint32  pair_version,
//        address send_gas_to
//    ) external;

    function transferV2(
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

    function burn(
        address[] _roots,
        address _lpTokenRoot,
        uint128 _amount,
        address _remainingGasTo,
        address _callbackTo,
        TvmCell _payload
    ) external;

}
