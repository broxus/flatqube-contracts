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

    const FactoryLimitOrder = await locklift.factory.getContract('LimitOrderFactory');
    const RootLimitOrder = await locklift.factory.getContract('LimitOrderRoot');
    const LimitOrder = await locklift.factory.getContract('LimitOrder');
    const ClosedLimitOrder = await locklift.factory.getContract('LimitOrderClosed');
    const PlatformLimitOrder = await locklift.factory.getContract('LimitOrderPlatform');

    const dexRoot = migration.load(await locklift.factory.getAccount('DexRoot'),'DexRoot').address;
    
    console.log(`Deploying LimitOrderFactory...`);
    const factoryLimitOrder = await locklift.giver.deployContract({
        contract: FactoryLimitOrder,
        constructorParams: {
            _owner: account.address,
            _version: 1  
        },
        initParams: {
            randomNonce: getRandomNonce(),
            dexRoot: dexRoot
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));
    console.log(`LimitOrderFactory deploing end. Address: ${factoryLimitOrder.address}`);
    
    console.log(`Set code LimitOrderRoot`);
    await account.runTarget({
        contract: factoryLimitOrder,
        method: 'setLimitOrderRootCode',
        params: {_limitOrdersRootCode: RootLimitOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });

    console.log(`Set code LimitOrder`);
    await account.runTarget({
        contract: factoryLimitOrder,
        method: 'setLimitOrderCode',
        params: {_limitOrderCode: LimitOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });
    
    console.log(`Set code LimitOrderClosed`);
    await account.runTarget({
        contract: factoryLimitOrder,
        method: 'setlimitOrderCodeClosed',
        params: {_limitOrderCodeClosed: ClosedLimitOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });

    console.log(`Set code Platform`);
    await account.runTarget({
        contract: factoryLimitOrder,
        method: 'setlimitOrderCodePlatform',
        params: {_limitOrderPlatform: PlatformLimitOrder.code},
        value: locklift.utils.convertCrystal('0.1', 'nano'),
        keyPair
    });

    migration.store(factoryLimitOrder, 'LimitOrderFactory');

    rootToken = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'BarRoot');

   tx = await account.runTarget ({
        contract: factoryLimitOrder,
        method: 'createLimitOrdersRoot',
        params: {
            tokenRoot: rootToken.address
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