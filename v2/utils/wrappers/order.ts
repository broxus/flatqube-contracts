import {Address, Contract, Signer} from "locklift";
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'
import BigNumber from "bignumber.js";
const {toNano} = locklift.utils;


export class OrderWrapper {
    public contract: Contract<FactorySource["Order"]>;
    public _owner: Account | null;
    public address: Address;

    constructor(order_contract: Contract<FactorySource["Order"]>, order_owner: Account | null) {
        this.contract = order_contract;
        this._owner = order_owner;
        this.address = this.contract.address;
    }

    static async from_addr(addr: Address, owner: Account | null) {
        const order = await locklift.factory.getDeployedContract('Order', addr);
        return new OrderWrapper(order, owner);
    }

    async balance() {
        return await locklift.provider.getBalance(this.address).then(balance => Number(balance));
    }
    async feeParams() {
        return this.contract.methods.getFeeParams({answerId: 0}).call();
    }

    async status() {
        return (await this.contract.methods.currentStatus({answerId: 0}).call()).value0;
    }

    async expectedSpendAmount(amount: string | number) {
        return (await this.contract.methods.getExpectedSpendAmount({answerId: 0, amount: amount}).call()).value0;
    }

    async expectedSpendAmountOfMatching(amount: string | number) {
        return (await this.contract.methods.getExpectedSpendAmountOfMatching({answerId: 0, amount: amount}).call()).value0;
    }

    async buildPayload(
        callbackId: number,
        deployWalletValue: number
        ) {
        return (await this.contract.methods.buildPayload(
            {
                callbackId: callbackId,
                deployWalletValue: locklift.utils.toNano(deployWalletValue)
            }).call()).value0;
    }

    async cancel(
        callbackId: number,
        amount: number,
        account: Address
    ) {
        // @ts-ignore
        await this.contract.methods.cancel({callbackId: 0}).send({
           amount: locklift.utils.toNano(amount),
           from: account
        });
    }

    async swap(
        callbackId: number,
        deployWalletValue: number,
        trace: boolean = false,
        from: Address
    ) {

        const owner = this._owner as Account;
        if (trace){

            return await locklift.tracing.trace(this.contract.methods.swap({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1)
            }).send({
                amount: locklift.utils.toNano(6), from: from
            }), {allowedCodes: {compute: [60, 302, 100]}})
        } else {
            return await this.contract.methods.swap({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1)
            }).send({
                amount: locklift.utils.toNano(6), from: from
            })
        }
    }

    async backendSwap(
        callbackId: number,
        publicKey: string
    ) {
        // @ts-ignore
        await this.contract.methods.backendSwap({callbackId: callbackId}).sendExternal({publicKey: publicKey});
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
        signer: Signer
        ) {
        if (trace){
            return await locklift.tracing.trace(this.contract.methods.proxyTokensTransfer({
                _tokenWallet: _tokenWallet,
                _gasValue: locklift.utils.toNano(_gasValue),
                _amount: _amount,
                _recipient: _recipient,
                _deployWalletValue: locklift.utils.toNano(_deployWalletValue),
                _remainingGasTo: _remainingGasTo,
                _notify: _notify,
                _payload: _payload
            }).sendExternal({publicKey: signer.publicKey}));
        } else {
                return await this.contract.methods.proxyTokensTransfer({
                _tokenWallet: _tokenWallet,
                _gasValue: locklift.utils.toNano(_gasValue),
                _amount: _amount,
                _recipient: _recipient,
                _deployWalletValue: locklift.utils.toNano(_deployWalletValue),
                _remainingGasTo: _remainingGasTo,
                _notify: _notify,
                _payload: _payload
            }).sendExternal({publicKey: signer.publicKey});
        }
    }

    async matching(
        callbackId: number,
        deployWalletValue: number,
        limitOrder: Address,
        from: Address,
        trace: boolean
    ) {
        if (trace){
            return await locklift.tracing.trace(
                this.contract.methods.matching({
                callbackId: callbackId,
                deployWalletValue: locklift.utils.toNano(deployWalletValue),
                limitOrder: limitOrder
            }).send({
                amount: locklift.utils.toNano(6), from: from
            }), {allowedCodes:{compute:[60]}}
            )
        } else {
            return await
                this.contract.methods.matching({
                callbackId: callbackId,
                deployWalletValue: locklift.utils.toNano(deployWalletValue),
                limitOrder: limitOrder
            }).send({
                amount: locklift.utils.toNano(6), from: from
            })
        }
    }

    async backendMatching(
        callbackId: number,
        limitOrder: Address,
        publicKey: string
    ) {
        // @ts-ignore
        await locklift.tracing.trace(
            this.contract.methods.backendMatching({callbackId: callbackId, limitOrder: limitOrder}).
            sendExternal({publicKey: publicKey}), {allowedCodes: {compute: [null,60]}});
    }
}