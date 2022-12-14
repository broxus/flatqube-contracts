pragma ton-solidity >= 0.57.0;

interface ICreateOrderRejectResult {
    struct CreateOrderRejectResult {
		address spentToken;
		uint128 spentAmount;
		address receiveToken;
		uint128 expectedAmount;
    }
}