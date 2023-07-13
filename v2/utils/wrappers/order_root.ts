import {Address, Contract} from "locklift";
// @ts-ignore
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'
import {OrderWrapper} from "./order";

export class OrderRoot {
    public contract: Contract<FactorySource["OrderRoot"]>;
    public _owner: Account | null;
    public address: Address;

    constructor(order_contract: Contract<FactorySource["OrderRoot"]>, order_owner: Account | null) {
        this.contract = order_contract;
        this._owner = order_owner;
        this.address = this.contract.address;
    }

    static async from_addr(addr: Address, owner: Account | null) {
        const factory = await locklift.factory.getDeployedContract('OrderRoot', addr);
        return new OrderRoot(factory, owner);
    }

    async feeParams() {
        return (await this.contract.methods.getFeeParams({answerId: 0}).call());
    }

    async spentToken() {
        return this.contract.methods.getSpentToken({answerId: 0}).call();
    }

    async factory() {
        return this.contract.methods.getFactory({answerId: 0}).call();
    }

    async expectedAddressOrder(
        _factory: Address,
        _root: Address,
        _owner: Address,
        _spentToken: Address,
        _receiveToken: Address,
        timeTx: number,
        nowTx: number
    ) {
        return await this.contract.methods.expectedAddressOrder({
            answerId: 0,
            _factory: _factory,
            _root: _root,
            _owner: _owner,
            _receiveToken: _receiveToken,
            _spentToken: _spentToken,
            timeTx: timeTx,
            nowTx: nowTx
        }).call();
    }

    async buildPayloadRoot(
        callbackId: number | string,
        user: Address,
        tokenReceive: Address,
        expectedTokenAmount: number | string,
        backPK: number | string,
        backMatchingPK:  number | string,
        cancelPayload: string = ''
    ) {
        return (await this.contract.methods.buildPayload({
            callbackId: callbackId,
            user: user,
            tokenReceive: tokenReceive,
            expectedTokenAmount: expectedTokenAmount,
            backPK: backPK,
            backMatchingPK: backMatchingPK,
            cancelPayload: cancelPayload
        }).call()).value0;
    }

    async originalPayloadCancel(
        op: number,
        callbackId: number,
        sender: Address
    ){
        const dataT = await locklift.provider.packIntoCell(({
            structure: [
                { name: 'op', type: 'uint8' },
                { name: 'callbackId', type: 'uint64' },
                { name: 'sender', type: 'address' },
            ],
            data: {
                op: op,
                callbackId: callbackId,
                sender: sender,
            }
        }));

        return dataT.boc;
    }

    async buildCancelPayload(
        operation: number,
        errorCode: number,
        originalPayload: string
    ) {
        const cancelPayload = await locklift.provider.packIntoCell({
            structure: [
                { name: 'orderStatus', type: 'uint8' },
                { name:'op', type: 'uint8' },
                { name:'errorCode', type: 'uint16' },
                { name: 'originalPayload', type: 'cell' },
            ] as const,
            data: {
                orderStatus: 205,
                op: operation,
                errorCode: errorCode,
                originalPayload: originalPayload
            }
        });
        return cancelPayload.boc;
    }

    async getEventCreateOrder(accountOwner: Account){
        const pastEvents = await this.contract.getPastEvents({filter: (event) => event.event === "CreateOrder"});
        // @ts-ignore
        const orderAddress = pastEvents.events[0].data.order;
        return  await OrderWrapper.from_addr(orderAddress, accountOwner);
    }
}