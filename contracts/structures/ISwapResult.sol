pragma ton-solidity >= 0.57.0;

interface ISwapResult {
    struct SwapResult {
		address initiator;
		uint128 deployWalletValue;
    }
}