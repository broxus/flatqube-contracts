pragma ton-solidity >= 0.62.0;

interface IResetGas {
    function resetGas(address receiver) external view;
}
