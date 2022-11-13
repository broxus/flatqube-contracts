pragma ton-solidity >= 0.57.0;

interface ISwapResultResult {
    struct SwapResultResult {
		address initiator;
		uint128 deployWalletValue;
		uint128 differenceSwap;
    }
}