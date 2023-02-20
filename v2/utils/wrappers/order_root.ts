import {Address, Contract} from "locklift";
// @ts-ignore
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'
import {OrderWrapper} from "./order";
const {toNano} = locklift.utils;


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
        tokenReceive: Address,
        expectedTokenAmount: number | string,
        deployWalletValue: number | string,
        backPK: number | string,
        backMatchingPK:  number | string
    ) {
        return (await this.contract.methods.buildPayload({
            callbackId: callbackId,
            tokenReceive: tokenReceive,
            expectedTokenAmount: expectedTokenAmount,
            deployWalletValue: deployWalletValue,
            backPK: backPK,
            backMatchingPK: backMatchingPK
        }).call()).value0;
    }

    async getEvents(event_name: string) {
        // @ts-ignore
        return (await this.contract.getPastEvents({filter: (event) => event.event === event_name})).events;
    }

    async getEventsCreateOrder(owner: Account) {
        // @ts-ignore
        return await OrderWrapper.from_addr((this.getEvents("CreateOrder"))[0].data.order, owner);
    }

}