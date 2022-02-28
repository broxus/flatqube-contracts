pragma ton-solidity >= 0.57.0;

interface IEverTIP3SwapCallbacks {
    function onCancel(
        uint64 id
     ) external;

    function onSuccess(
        uint64 id,
        uint128 amount
     ) external;
}