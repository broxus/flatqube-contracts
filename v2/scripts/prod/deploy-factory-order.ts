import {Command} from "commander";
import {toNano, WalletTypes, getRandomNonce, zeroAddress} from "locklift";

const prompts = require('prompts');
const {Migration} = require(process.cwd()+'/scripts/utils')
const isValidEverAddress = (address: any) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

const migration = new Migration();

async function main() {
    const response = await prompts([
        {
            type: 'text',
            name: 'owner',
            message: 'OrderFactory owner',
            validate: (value:any) => isValidEverAddress(value) || value === '' ? true : 'Invalid Everscale address'
        },
        {
            type: 'text',
            name: 'dexRoot',
            message: 'OrderFactory DexRoot',
            validate: (value:any) => isValidEverAddress(value) || value === '' ? true : 'Invalid Everscale address'
        }
    ]);

    const signer = (await locklift.keystore.getSigner('0'));
    const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

    const PlatformOrder = await locklift.factory.getContractArtifacts('OrderPlatform');
    const RootOrder = await locklift.factory.getContractArtifacts('OrderRoot');
    const Order = await locklift.factory.getContractArtifacts('Order');

    const {contract: factoryOrder} = await locklift.factory.deployContract({
        contract: 'OrderFactory',
        //@ts-ignore
        constructorParams: {
            _owner: account.address,
            _version: 1
        },
        //@ts-ignore
        initParams: {
            randomNonce: getRandomNonce(),
            dexRoot: response.dexRoot
        },
        publicKey: signer!.publicKey,
        value: toNano(2)
    });
    console.log(`Order Factory address: ${factoryOrder.address}`)

    console.log(`Set code OrderPlatform`)
    //@ts-ignore
    await factoryOrder.methods.setPlatformCodeOnce({_orderPlatform: PlatformOrder.code}).send({
        from: account.address,
        amount: toNano(0.1)
    })

    console.log(`Set code OrderRoot`)
    //@ts-ignore
    await factoryOrder.methods.setOrderRootCode({_orderRootCode: RootOrder.code}).send({
        from: account.address,
        amount: toNano(0.1)
    })

    console.log(`Set code Order`)
    //@ts-ignore
    await factoryOrder.methods.setOrderCode({_orderCode: Order.code}).send({
        from: account.address,
        amount: toNano(0.1)
    })

    console.log(`Set FeeParams`)
    //@ts-ignore
    await factoryOrder.methods.setFeeParams({
        params:
            {
                numerator: 0,
                denominator: 0,
                matchingNumerator: 0,
                matchingDenominator: 0,
                beneficiary: factoryOrder.address
            }
    }).send({
        from: account.address,
        amount: toNano(0.1)
    });

    console.log(`Set newOwner`)
    //@ts-ignore
    await factoryOrder.methods.transferOwner({answerId: 0, newOwner: response.owner}).send({
        from: account.address,
        amount: toNano(0.1)
    })

    migration.store(factoryOrder, 'OrderFactory');

}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
