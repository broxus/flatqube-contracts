pragma ton-solidity >= 0.57.0;

interface ICreateOrderResult {
    struct CreateOrderResult {
		address order;
		address spentToken;
		uint128 spentAmount;
		address receiveToken;
		uint128 expectedAmount;
    }
}