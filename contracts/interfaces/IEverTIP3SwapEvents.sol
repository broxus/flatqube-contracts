pragma ton-solidity >= 0.57.0;

interface IEverTip3SwapEvents {

    // EverToTip3 contract events
    event SwapEverToTip3WEverMint(
        uint64 id, 
        uint128 amount,
        address pair, 
        uint128 expectedAmount,
        uint128 deployWalletValue
    );
    event SwapEverToTip3SuccessTransfer(address user, uint64 id);
    event SwapEverToTip3CancelTransfer(address user, uint64 id);

    // Tip3ToEvent contract events
    event SwapTip3EverSuccessTransfer(address user, uint64 id);
    event SwapTip3EverCancelTransfer(address user, uint64 id);

    // EverWEverToTip3 contract events
    event SwapEverWEverToTip3Unwrap(address user, uint64 id);
}