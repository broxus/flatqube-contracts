pragma ton-solidity >= 0.61.2;

interface IGasValueStructure {

   struct GasValue {
        uint128 fixedValue;
        uint128 dynamicGas;
    }
}