import {Address, Contract, Signer, toNano, zeroAddress} from "locklift";
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'

export type PayloadOrder = {
    destination: Address;
} & {
    amount: string | number;
} & {
    gasValue: string | number;
} & {
    payload: string;
};

export class MSWrapper {

    public contract: Contract<FactorySource["MultiScatter"]>;
    public _owner: Account | null;
    public address: Address;

    constructor(order_contract: Contract<FactorySource["MultiScatter"]>, contract_owner: Account | null) {
        this.contract = order_contract;
        this._owner = contract_owner;
        this.address = this.contract.address;
    }

    static async from_addr(addr: Address, owner: Account | null) {
        const ms = await locklift.factory.getDeployedContract('MultiScatter', addr);
        return new MSWrapper(ms, owner);
    }

    async buildPayload(
        payloadsOrders: PayloadOrder[]
    ) {
        return (await this.contract.methods.buildPayload(
            {
                payloadsOrders
            }
        ).call()).value0;
    }

    async upgrade(
        newCode: string,
        newVersion: string | number,
        sendGasTo: Address,
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.upgrade({
            _code: newCode,
            _newVersion: newVersion,
            _sendGasTo: sendGasTo
        })
            .send({amount: toNano(2), from: owner.address}))
    }

    async sendGas(
        to: Address,
        _value: string,
        _flag: number
    ) {
        const owner = this._owner as Account;
        return await this.contract.methods.sendGas({
            to: to,
            _value: _value,
            _flag: _flag
        }).send({amount: toNano(0.2), from: owner.address});
    }

    async proxyTokensTransfer(
        _tokenWallet: Address,
        _gasValue: number,
        _amount: string,
        _recipient: Address,
        _deployWalletValue: number,
        _remainingGasTo: Address,
        _notify: boolean,
        _payload: string = 'te6ccgEBAQEAAgAAAA==',
        trace: boolean = false,
    ) {
        const owner = this._owner as Account;
        if (trace) {
            return await locklift.tracing.trace(this.contract.methods.proxyTokensTransfer({
                _tokenWallet: _tokenWallet,
                _gasValue: toNano(_gasValue),
                _amount: _amount,
                _recipient: _recipient,
                _deployWalletValue: toNano(_deployWalletValue),
                _remainingGasTo: _remainingGasTo,
                _notify: _notify,
                _payload: _payload
            }).send({from: owner.address, amount: toNano(0.2)}));
        } else {
            return await this.contract.methods.proxyTokensTransfer({
                _tokenWallet: _tokenWallet,
                _gasValue: toNano(_gasValue),
                _amount: _amount,
                _recipient: _recipient,
                _deployWalletValue: toNano(_deployWalletValue),
                _remainingGasTo: _remainingGasTo,
                _notify: _notify,
                _payload: _payload
            }).send({from: owner.address, amount: toNano(0.2)});
        }
    }
}