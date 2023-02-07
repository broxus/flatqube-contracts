import {Address, Contract} from "locklift";
import {FactorySource} from "../../../build/factorySource";
import {Account} from 'locklift/everscale-client'
import {logTestProcessing} from "../log.utils";
import BigNumber from "bignumber.js";
const {toNano} = locklift.utils;


export class TokenWallet {
    public contract: Contract<FactorySource["TokenWalletUpgradeable"]>;
    public _owner: Account | null;
    public address: Address;
    public name: string | undefined;

    constructor(wallet_contract: Contract<FactorySource["TokenWalletUpgradeable"]>, wallet_owner: Account | null, name?: string) {
        this.contract = wallet_contract;
        this._owner = wallet_owner;
        this.address = this.contract.address;
        this.name = name ? name : undefined;
    }

    static async from_addr(addr: Address, owner: Account | null, name?: string) {
        const wallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable', addr);
        return new TokenWallet(wallet, owner, name);
    }

    async owner() {
        return await this.contract.methods.owner({answerId: 0}).call();
    }

    async root() {
        return await this.contract.methods.root({answerId: 0}).call();
    }

    async balance() {
        return (await this.contract.methods.balance({answerId: 0}).call()).value0;
    }

    async transfer(amount: number|string, receiver: Address, payload = '', value: any, params?: any) {
        let notify = payload !== '';

        logTestProcessing(`${this.name}(${this.address}).transfer()`,
  `amount: ${amount},
          recipient: ${receiver},
          deployWalletValue: ${locklift.utils.toNano(0.2)},
          remainingGasTo: ${this.address},
          notify: ${true},
          payload: ${params ? JSON.stringify(params) : payload}
          )`)

        const owner = this._owner as Account;
        return await this.contract.methods.transfer({
            amount: amount,
            recipient: receiver,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: notify,
            payload: payload
        }).send({
            amount: value || toNano(5),
            from: owner.address
        });
    }
}