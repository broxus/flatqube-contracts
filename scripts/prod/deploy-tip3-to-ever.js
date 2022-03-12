const { Command } = require('commander');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('prompts');

const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

async function main() {
    const keyPairs = await locklift.keys.getKeyPairs();
    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-evroot', '--weverroot <wEverRoot>', 'WEver Root')
        .option('-ewvault', '--wevervault <wEverVault>', 'WEver Vault');

    program.parse(process.argv);  
    
    const options = program.opts();

    if (!isValidTonAddress(options.weverroot)) {
        promptsData.push({
            type: 'text',
            name: 'wEverRoot',
            message: 'WEver Root',
            validate: value => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    if (!isValidTonAddress(options.wevervault)) {
        promptsData.push({
            type: 'text',
            name: 'wEverVault',
            message: 'WEver Vault',
            validate: value => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    const response = await prompts(promptsData);
    const wEverRoot_ = options.weverroot || response.wEverRoot;
    const wEverVault_ = options.wevervault || response.wEverVault;

    const Tip3ToEver = await locklift.factory.getContract('Tip3ToEver');

    let tip3ToEver = await locklift.giver.deployContract({
        contract: Tip3ToEver,
        constructorParams: {
            _wEverRoot: wEverRoot_,
            _wEverVault: wEverVault_,
        },
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair: keyPairs[0],
    }, locklift.utils.convertCrystal('3', 'nano'));

    logger.log(`'TIP3 to Ever': ${tip3ToEver.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });