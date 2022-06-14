pragma ton-solidity >= 0.57.0;

interface IEverTip3SwapEvents {

    event SwapEverToTip3Start(
        address pair,
        uint8 operationType,
        uint64 id,
        address user
    );

    event SwapEverToTip3Success(address user, uint64 id, uint128 amount, address tokenRoot);
    event SwapEverToTip3Partial(address user, uint64 id, uint128 amount, address tokenRoot);
    event SwapEverToTip3Cancel(address user, uint64 id, uint128 amount);

    // Tip3ToEvent contract events
    event SwapTip3EverSuccessTransfer(address user, uint64 id, uint128 amount);
    event SwapTip3EverCancelTransfer(address user, uint64 id, uint128 amount, address tokenRoot);

    // EverWeverToTip3 contract events
    event SwapEverWeverToTip3Unwrap(address user, uint64 id);
}
