pragma ton-solidity >= 0.57.0;

interface IEverTIP3SwapEvents {
    event WrapEverToWEver(address user, uint64 id);
    event WEverTokenMint(address user, uint64 id);
    event WEverTIP3Cancel(address user, uint64 id);
    event TIP3WEverCancel(address user, uint64 id);
    event TIP3WEverSuccess(address user, uint64 id);
    event TIP3TokenSuccessBurn(address user, uint64 id);
    event WEverTokenCancelBurn(address user, uint64 id);
    event WEverTIP3Success(address user, uint64 id);
}