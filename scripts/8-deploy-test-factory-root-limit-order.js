const {getRandomNonce, Migration, TOKEN_CONTRACTS_PATH, Constants, afterRun} = require(process.cwd()+'/scripts/utils')
const logger = require('mocha-logger');
const {Command} = require('commander');
const program = new Command();
const logTx = (tx) => logger.success(`Transaction: ${tx.transaction.id}`);
const migration = new Migration();

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
            dexRoot: dexRoot,
            limitOrdersRootCode: RootLimitOrder.code,
            limitOrderCode: LimitOrder.code,
            limitOrderCodeClosed: ClosedLimitOrder.code,
            limitOrderPlatform: PlatformLimitOrder.code 
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));
    console.log(`LimitOrderFactory deploing end. Address: ${factoryLimitOrder.address}`);

    migration.store(factoryLimitOrder, 'LimitOrderFactory');

    rootToken = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'BarRoot');

    // Вызов метода из Factory - createLimitOrdersRoot
    tx = await account.runTarget ({
        contract: FactoryLimitOrder,
        method: 'createLimitOrdersRoot',
        params: {
            tokenRoot: rootToken.address,    
        },
        value: locklift.utils.convertCrystal('3', 'nano'),
        keyPair
    });

    logTx(tx);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });