pragma ton-solidity >= 0.57.0;

interface IEverTIP3SwapEvents {

    // EverToTIP3 contract events
    event SwapEverToTIP3WEVERMint(
        uint64 id, 
        uint128 amount,
        address pair, 
        uint128 expectedAmount,
         uint128 deployWalletValue
    );
    event SwapEverToTIP3SuccessTransfer(address user, uint64 id);
    event SwapEverToTIP3CancelTransfer(address user, uint64 id);

    // TIP3ToEvent contract events
    event SwapTIP3EverSuccessTransfer(address user, uint64 id);
    event SwapTIP3EverCancelTransfer(address user, uint64 id);

    // EverWEverToTIP3 contract events
    event SwapEverWEverToTIP3Unwrap(address user, uint64 id);
}