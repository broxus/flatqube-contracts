const {getRandomNonce, Migration, WEVER_CONTRACTS_PATH, TOKEN_CONTRACTS_PATH} = require(process.cwd()+'/scripts/utils')
const {Command} = require('commander');
const program = new Command();

async function main() {
    const migration = new Migration();

    const EverToTip3 = await locklift.factory.getContract('EverToTip3');
    const Tip3ToEver = await locklift.factory.getContract('TIP3ToEver');
    const EverWEverToTIP3 = await locklift.factory.getContract('EverWEverToTIP3');

    const [keyPair] = await locklift.keys.getKeyPairs();

    const WEVERRoot = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'WEVERRoot').address;
    const WEVERVault = migration.load(await locklift.factory.getContract('TestWeverVault'), 'WEVERVault').address;

    console.log(`Deploying EverToTip3...`);
    const everToTip3 = await locklift.giver.deployContract({
        contract: EverToTip3,
        constructorParams: {
            _wEverRoot: WEVERRoot,
            _wEverVault: WEVERVault
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`EverToTip3 address: ${everToTip3.address}`);

    console.log(`Deploying Tip3ToEver...`);
    const tip3ToEver = await locklift.giver.deployContract({
        contract: Tip3ToEver,
        constructorParams: {
            _wEverRoot: WEVERRoot,
            _wEverVault: WEVERVault,
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`Tip3ToEver address: ${tip3ToEver.address}`);

    console.log(`Deploying EverWEverToTIP3...`);
    const everWEverToTIP3 = await locklift.giver.deployContract({
        contract: EverWEverToTIP3,
        constructorParams: {
            _wEverRoot: WEVERRoot,
            _wEverVault: WEVERVault,
            _swapEver: everToTip3.address,
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));    
    console.log(`EverWEverToTIP3 address: ${everWEverToTIP3.address}`);

    migration.store(everToTip3, 'EverToTip3');
    migration.store(tip3ToEver, 'Tip3ToEver');
    migration.store(everWEverToTIP3, 'EverWEverToTIP3');
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });