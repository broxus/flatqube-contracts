const {getRandomNonce, Migration, TOKEN_CONTRACTS_PATH, Constants, afterRun} = require(process.cwd()+'/scripts/utils')
const migration = new Migration();

let tx;
const displayTx = (_tx) => {
  console.log(`txId: ${_tx.transaction.id}`);
};

async function main() {
    const [keyPair] = await locklift.keys.getKeyPairs();
    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;

    const FactoryOrder = await locklift.factory.getContract('OrderFactory');
    const RootOrder = await locklift.factory.getContract('OrderRoot');
    const Order = await locklift.factory.getContract('Order');
    const ClosedOrder = await locklift.factory.getContract('OrderClosed');
    const PlatformOrder = await locklift.factory.getContract('OrderPlatform');

    const dexRoot = migration.load(await locklift.factory.getAccount('DexRoot'),'DexRoot').address;
    
    console.log(`Deploying OrderFactory...`);
    const factoryOrder = await locklift.giver.deployContract({
        contract: FactoryOrder,
        constructorParams: {
            _owner: account.address,
            _version: 1  
        },
        initParams: {
            randomNonce: getRandomNonce(),
            dexRoot: dexRoot
        },
        keyPair,
    }, locklift.utils.convertCrystal('1.5', 'nano'));
    console.log(`OrderFactory deploing end. Address: ${factoryOrder.address}`);
    
    console.log(`Set code OrderPlatform`);
    await account.runTarget({
        contract: factoryOrder,
        method: 'setPlatformCodeOnce',
        params: {_orderPlatform: PlatformOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });

    console.log(`Set code OrderRoot`);
    await account.runTarget({
        contract: factoryOrder,
        method: 'setOrderRootCode',
        params: {_orderRootCode: RootOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });

    console.log(`Set code Order`);
    await account.runTarget({
        contract: factoryOrder,
        method: 'setOrderCode',
        params: {_orderCode: Order.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });
    
    console.log(`Set code OrderClosed`);
    await account.runTarget({
        contract: factoryOrder,
        method: 'setOrderClosedCode',
        params: {_orderClosedCode: ClosedOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });
    
    migration.store(factoryOrder, 'OrderFactory');
    rootToken = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'BarRoot');

    tx = await account.runTarget ({
        contract: factoryOrder,
        method: 'createOrderRoot',
        params: {
            token: rootToken.address
        },
        value: locklift.utils.convertCrystal('3', 'nano'),
        keyPair
    });
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });