pragma ton-solidity >= 0.57.0;

interface IEverTIP3SwapCallbacks {
    function onSwapEverToTip3Cancel(
        uint64 id
     ) external;

    function onSwapEverToTip3Success(
        uint64 id,
        uint128 amount
     ) external;

     function onSwapTIP3ToEverCancel(
         uint64 id
     ) external;

     function onSwapTIP3ToEverSuccess(
         uint64 id,
         uint128 amount
     ) external;
}