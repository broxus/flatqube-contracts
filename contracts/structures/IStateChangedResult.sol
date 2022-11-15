pragma ton-solidity >= 0.57.0;

import '../interfaces/IOrder.sol';

interface IStateChangedResult {
    struct StateChangedResult {
        uint8 from;
        uint8 to;
        IOrder.Details details;
    }
}