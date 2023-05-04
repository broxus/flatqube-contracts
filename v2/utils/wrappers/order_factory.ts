import {Address, Contract, toNano, zeroAddress} from "locklift";
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'

export class OrderFactory {
    public contract: Contract<FactorySource["OrderFactory"]>;
    public _owner: Account | null;
    public address: Address;

    constructor(order_contract: Contract<FactorySource["OrderFactory"]>, order_owner: Account | null) {
        this.contract = order_contract;
        this._owner = order_owner;
        this.address = this.contract.address;
    }

    static async from_addr(addr: Address, owner: Account | null) {
        const factory = await locklift.factory.getDeployedContract('OrderFactory', addr);
        return new OrderFactory(factory, owner);
    }

    async feeParams() {
        return await this.contract.methods.getFeeParams({answerId: 0}).call();
    }

    async owner() {
        return await this.contract.methods.getOwner({answerId: 0}).call();
    }

    async setFeeParams(
        feeNumerator: string | number,
        feeDenominator: string | number,
        matchingNumerator: string | number,
        matchingDenominator: string | number,
        beneficiary: Address = zeroAddress,
        trace: boolean = false
    ) {
      const owner = this._owner as Account;
      if (trace){
        return await locklift.tracing.trace(this.contract.methods.setFeeParams({
            params:
            {
              numerator: feeNumerator,
              denominator: feeDenominator,
              matchingNumerator: matchingNumerator,
              matchingDenominator: matchingDenominator,
              beneficiary: beneficiary
            }
          }).send({
            amount: toNano(5),
            from: owner.address
            }))
      } else {
          return await this.contract.methods.setFeeParams({
            params:
            {
              numerator: feeNumerator,
              denominator: feeDenominator,
              matchingNumerator: matchingNumerator,
              matchingDenominator: matchingDenominator,
              beneficiary: beneficiary
            }
          }).send({
            amount: toNano(5),
            from: owner.address
            })
      }
    }

    async setRootFeeParams(
        roots: Address[],
        feeNumerator: string | number,
        feeDenominator: string | number,
        matchingNumerator: string | number,
        matchingDenominator: string | number,
        beneficiary: Address = zeroAddress,
        trace: boolean = false
    ) {
      const owner = this._owner as Account;
      if (trace){
        return await locklift.tracing.trace(this.contract.methods.setRootFeeParams({
            roots: roots,
            params:
            {
              numerator: feeNumerator,
              denominator: feeDenominator,
              matchingNumerator: matchingNumerator,
              matchingDenominator: matchingDenominator,
              beneficiary: beneficiary
            }
          }).send({
            amount: toNano(5),
            from: owner.address
            }))
      } else {
          return await this.contract.methods.setRootFeeParams({
            roots: roots,
            params:
            {
              numerator: feeNumerator,
              denominator: feeDenominator,
              matchingNumerator: matchingNumerator,
              matchingDenominator: matchingDenominator,
              beneficiary: beneficiary
            }
          }).send({
            amount: toNano(5),
            from: owner.address
            })
      }
    }

    async setEmergency(
        enabled: boolean,
        orderAddress: Address,
        manager: string
    ){
          return await locklift.tracing.trace(this.contract.methods.setEmergency({
            enabled: enabled,
            orderAddress  : orderAddress,
            manager: manager
          }).send({
            amount: toNano(1),
            from: this._owner.address
            }), {allowedCodes: {compute: [60]}});
    }

    async withdrawFee(
        amount: string | number,
        recipient: Address,
        sendGasTo: Address,
        tokenWallet: Address,
        deployWalletValue: number,
        trace: boolean = false
    ) {
        const owner = this._owner as Account;

        if (trace){
            return await locklift.tracing.trace(this.contract.methods.withdrawFee({
                amount: amount,
                recipient: recipient,
                sendGasTo: sendGasTo,
                tokenWallet: tokenWallet,
                deployWalletValue: toNano(deployWalletValue)
            }).send({amount: toNano(2), from: owner.address}),{allowedCodes: {compute: [60]}})

        } else {
            return await this.contract.methods.withdrawFee({
                amount: amount,
                recipient: recipient,
                sendGasTo: sendGasTo,
                tokenWallet: tokenWallet,
                deployWalletValue: toNano(deployWalletValue)
            }).send({amount: toNano(2), from: owner.address}),{allowedCodes: {compute: [60]}}
        }
    }

    async setOrderCode(
        code: string
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.setOrderCode({_orderCode: code})
        .send({amount: toNano(1.1), from: owner.address}))

    }
    async upgradeOrderInOrderRoot(roots: Address[]) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(
            this.contract.methods.upgradeOrderCodeInOrderRoot({listOrderRoots: roots})
            .send({amount: toNano(2), from: owner.address}))
    }


    async updateOrder(
        orders: Address[]
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.upgradeOrder({listOrders: orders})
        .send({amount: toNano(1.1), from: owner.address}))
    }

    async setOrderRootCode(
        code: string
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.setOrderRootCode({_orderRootCode: code})
        .send({amount: toNano(1.1), from: owner.address}))

    }

    async transferOwner(
        _newOwner: Address
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.transferOwner({
            answerId: 0, newOwner: _newOwner,
        }).send({amount: toNano(1.1), from: owner.address}))
    }

    async upgradeOrderRoot(
        roots: Address[]
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(
            this.contract.methods.upgradeOrderRoot({listOrderRoots: roots})
        .send({amount: toNano(1.1), from: owner.address}))
    }

    async upgrade(
        newCode: string,
        sendGasTo: Address,
        newVersion: string | number
    ) {
        const owner = this._owner as Account;
        return await locklift.tracing.trace(this.contract.methods.upgrade(
            {
                newCode: newCode,
                sendGasTo: sendGasTo,
                newVersion: newVersion
            })
        .send({amount: toNano(1.1), from: owner.address}))
    }
}