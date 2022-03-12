const {getRandomNonce, Migration, TOKEN_CONTRACTS_PATH} = require(process.cwd()+'/scripts/utils')
const {Command} = require('commander');
const program = new Command();

async function main() {
    const migration = new Migration();

    const EverToTip3 = await locklift.factory.getContract('EverToTip3');
    const Tip3ToEver = await locklift.factory.getContract('Tip3ToEver');
    const EverWEverToTip3 = await locklift.factory.getContract('EverWEverToTip3');

    const [keyPair] = await locklift.keys.getKeyPairs();

    const wEverRoot = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'WEVERRoot').address;
    const wEverVault = migration.load(await locklift.factory.getContract('TestWeverVault'), 'WEVERVault').address;

    console.log(`Deploying EverToTip3 contract...`);
    const everToTip3 = await locklift.giver.deployContract({
        contract: EverToTip3,
        constructorParams: {
            _wEverRoot: wEverRoot,
            _wEverVault: wEverVault
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`EverToTip3 deploing end. Address: ${everToTip3.address}`);

    console.log(`Deploying Tip3ToEver...`);
    const tip3ToEver = await locklift.giver.deployContract({
        contract: Tip3ToEver,
        constructorParams: {
            _wEverRoot: wEverRoot,
            _wEverVault: wEverVault,
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`Tip3ToEver deploing end. Address: ${tip3ToEver.address}`);

    console.log(`Deploying EverWEverToTip3...`);
    const everWEverToTIP3 = await locklift.giver.deployContract({
        contract: EverWEverToTip3,
        constructorParams: {
            _wEverRoot: wEverRoot,
            _wEverVault: wEverVault,
            _swapEver: everToTip3.address,
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`EverWEverToTip3 deploing end. Address: ${everWEverToTIP3.address}`);

    migration.store(everToTip3, 'EverToTip3');
    migration.store(tip3ToEver, 'Tip3ToEver');
    migration.store(everWEverToTIP3, 'EverWEverToTip3');
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });