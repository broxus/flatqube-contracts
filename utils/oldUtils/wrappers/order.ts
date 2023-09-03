import {Address, Contract, Signer, toNano, zeroAddress} from "locklift";
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'

export class OrderWrapper {
    public contract: Contract<FactorySource["Order"]> | Contract<FactorySource["TestNewOrderBad"]>;
    public _owner: Account | null;
    public address: Address;

    constructor(order_contract: Contract<FactorySource["Order"]> | Contract<FactorySource["TestNewOrderBad"]>, order_owner: Account | null) {
        this.contract = order_contract;
        this._owner = order_owner;
        this.address = this.contract.address;
    }

    static async from_addr(addr: Address, owner: Account | null) {
        const order = await locklift.factory.getDeployedContract('Order', addr);
        return new OrderWrapper(order, owner);
    }

    async getDetails() {
        return (await this.contract.methods.getDetails({answerId: 0}).call()).value0;
    }

    async balance() {
        return await locklift.provider.getBalance(this.address).then(balance => Number(balance));
    }

    async status() {
        return (await this.contract.methods.currentStatus({answerId: 0}).call()).value0;
    }

    async expectedSpentAmount(amount: string | number) {
        return (await this.contract.methods.getExpectedSpentAmount({answerId: 0, amount: amount}).call()).value0;
    }

    async buildPayload(
        callbackId: number | string,
        deployWalletValue: number | string,
        recipient: Address = zeroAddress,
        successPayload: string | null = null,
        cancelPayload: string | null = null,
        ) {
        return (await this.contract.methods.buildPayload(
            {
                callbackId: callbackId,
                deployWalletValue: toNano(deployWalletValue),
                recipient: recipient,
                successPayload: successPayload,
                cancelPayload: cancelPayload
            }).call()).value0;
    }

    async originalPayloadSuccess(
        op: number,
        callbackId: number,
        owner: Address
    ) {
        const dataT = await locklift.provider.packIntoCell(({
            structure: [
                { name: 'op', type: 'uint8' },
                { name: 'callbackId', type: 'uint64' },
                { name: 'owner', type: 'address' },
            ],
            data: {
                op: op,
                callbackId: callbackId,
                owner: owner,
            }
        }));

        return dataT.boc;
    }

    async originalPayloadCancel(
        op: number,
        callbackId: number,
        sender: Address
    ) {
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

    async buildSuccessPayload(
        operation: number,
        originalPayload: string,
        senderAddress: Address,
    ) {
        const data = await locklift.provider.packIntoCell({
            structure: [ {name: 'data', type: 'address'} ] as const,
            data: {data: senderAddress}
        });
        const successPayload = await locklift.provider.packIntoCell({
            structure: [
                { name:'orderStatus', type: 'uint8' },
                { name:'op', type: 'uint8' },
                { name:'originalPayload', type: 'cell' },
                { name: 'data', type: 'cell' },
            ] as const,
            data: {
                orderStatus: 203,
                op: operation,
                originalPayload: originalPayload,
                data: data.boc,
            }
        });
        return successPayload.boc;
    }

    async buildCancelPayload(
        operation: number,
        originalPayload: string
    ) {
        const cancelPayload = await locklift.provider.packIntoCell({
            structure: [
                { name:'orderStatus', type: 'uint8' },
                { name:'op', type: 'uint8' },
                { name:'originalPayload', type: 'cell' },
            ] as const,
            data: {
                orderStatus: 204,
                op: operation,
                originalPayload: originalPayload
            }
        });
        return cancelPayload.boc;
    }

    async swap(
        callbackId: number,
        deployWalletValue: number,
        from: Address,
        trace: boolean = false,
        beautyPrint: boolean = false
    ) {
        if (trace){
            const {traceTree} = await locklift.tracing.trace(this.contract.methods.swap({
                callbackId: callbackId,
                deployWalletValue: toNano(deployWalletValue)
            }).send({
                amount: toNano(6), from: from
            }), {allowedCodes: {compute: [60, 302, 100]}})

            if (beautyPrint) {
                for(let addr in traceTree?.balanceChangeInfo) {
                    console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toFixed());
                }

                await traceTree?.beautyPrint();
            }

            return
        } else {
            return await this.contract.methods.swap({
                callbackId: callbackId,
                deployWalletValue: toNano(deployWalletValue)
            }).send({
                amount: toNano(6), from: from
            })
        }
    }

    async cancel(
        callbackId: number = 0
    ){
        return await locklift.tracing.trace(this.contract.methods.cancel({callbackId: callbackId}).send({
                amount: toNano(3), from: this._owner.address
            }), {allowedCodes:{compute:[60]}});
    }

    async backendCancel(
        signer: any,
        callbackId: number = 0
    ){
        return await locklift.tracing.trace(this.contract.methods.cancel({callbackId: callbackId}).sendExternal({publicKey: signer.publicKey}), {allowedCodes:{compute:[60]}});
    }

    async backendSwap(
        signer: any,
        trace: boolean = false,
        beautyPrint : boolean = false
    ){
        if (trace) {
            const {traceTree} = await locklift.tracing.trace(this.contract.methods.backendSwap({callbackId: 1}).sendExternal({publicKey: signer.publicKey}),
                {allowedCodes: {compute: [60]}});

            if (beautyPrint) {
                for(let addr in traceTree?.balanceChangeInfo) {
                    console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString());
                }

                await traceTree?.beautyPrint();
            }
        } else {
            await this.contract.methods.backendSwap({callbackId: 1}).sendExternal({publicKey: signer.publicKey})
        }

        return
    }

    async sendGas(
        to: Address,
        _value: string,
        _flag: number,
        signer: any
    ){
        return await this.contract.methods.sendGas({
            to: to,
            _value: _value,
            _flag: _flag
        }).sendExternal({publicKey: signer.publicKey})

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
                _gasValue: toNano(_gasValue),
                _amount: _amount,
                _recipient: _recipient,
                _deployWalletValue: toNano(_deployWalletValue),
                _remainingGasTo: _remainingGasTo,
                _notify: _notify,
                _payload: _payload
            }).sendExternal({publicKey: signer.publicKey}));
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
            }).sendExternal({publicKey: signer.publicKey});
        }
    }

    async backendMatching(
        callbackId: number,
        limitOrder: Address,
        trace: boolean = false,
        beautyPrint: boolean = false,
        signer: any
    ) {
        if (trace){
            const {traceTree} = await locklift.tracing.trace( locklift.tracing.trace(
                this.contract.methods.backendMatching({
                callbackId: callbackId,
                limitOrder: limitOrder
            }).sendExternal({publicKey: signer.publicKey}),  {allowedCodes:{compute:[null, 60]}}
            ), {allowedCodes:{compute:[60, null]}});

            if (beautyPrint) {
                for(let addr in traceTree?.balanceChangeInfo) {
                    console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString());
                }

                await traceTree?.beautyPrint();
            }

            return
        } else{
           return await
                this.contract.methods.backendMatching({
                callbackId: callbackId,
                limitOrder: limitOrder
            }).sendExternal({publicKey: signer.publicKey})
        }
    }

    async matching(
        callbackId: number,
        deployWalletValue: number,
        orderRoot: Address,
        owner: Address,
        timeTx: string,
        nowTx: string,
        from: Address,
        trace: boolean,
        beautyPrint: boolean = false
    ) {
        if (trace){
            const {traceTree} = await locklift.tracing.trace(
                this.contract.methods.matching({
                    callbackId: callbackId,
                    deployWalletValue: toNano(deployWalletValue),
                    _orderRoot: orderRoot,
                    _owner: owner,
                    _timeTx: timeTx,
                    _nowTx: nowTx
            }).send({
                amount: toNano(6), from: from
            }),  {allowedCodes:{compute:[60, null]}});

            if (beautyPrint) {
                for(let addr in traceTree?.balanceChangeInfo) {
                    console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString());
                }

                await traceTree?.beautyPrint();
            }

            return
        } else {
            return await
                this.contract.methods.matching({
                    callbackId: callbackId,
                    deployWalletValue: toNano(deployWalletValue),
                    _orderRoot: orderRoot,
                    _owner: owner,
                    _timeTx: timeTx,
                    _nowTx: nowTx
            }).send({
                amount: toNano(6), from: from
            })
        }
    }
}