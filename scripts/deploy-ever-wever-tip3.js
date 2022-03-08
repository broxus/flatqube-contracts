const { Command } = require('commander');
const { Migration } = require('./utils');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('promepts');

const migration = new Migration();

async function main() {
    const keyPairs = await locklift.keys.getKeyPairs();
    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-evroot', '--weverroot <wEverRoot>', 'WEVER Root')
        .option('-ewvault', '--wevervault <wEverVault>', 'WEVER Vault')
        .option('-swapever', '--swapever <swapEver>', 'Swap Ever to TIP-3 address');

    program.parse(process.argv);  
    
    const options = program.opts();

    if (!isValidTonAddress(options.weverroot)) {
        promptsData.push({
            type: 'text',
            name: 'weverRoot',
            message: 'WEVER Root',
            validate: value => isValidTonAddress(value) ? true : 'Invalid TON address'
        })
    }

    if (!isValidTonAddress(options.wevervault)) {
        promptsData.push({
            type: 'text',
            name: 'weverVault',
            message: 'WEVER Vault',
            validate: value => isValidTonAddress(value) ? true : 'Invalid TON address'
        })
    }

    if (!isValidTonAddress(options.wevervault)) {
        promptsData.push({
            type: 'text',
            name: 'swapEver',
            message: 'WEVER Vault',
            validate: value => isValidTonAddress(value) ? true : 'Invalid TON address'
        })
    }

    const response = await prompts(promptsData);
    const weverRoot = options.weverroot || options.weverRoot;
    const weverVault = options.wevervault || options.weverVault;
    const swapEver = options.swapever || options.swapEver;

    const EverTIP3 = await locklift.factory.GetContract('EverWEverToTIP3');

    let everTIP3 = await locklift.giver.deployContracts({
        contract: EverTIP3,
        constructorParams: {},
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            wEverRoot: weverRoot,
            wEverVault_: weverVault,
        },
        keyPair: keyPairs[0],
    }, locklift.utils.convertCrystal('3', 'nano'));

    migration.store(everTIP3, 'Ever and WEVER to TIP3');
    logger.log(`'Ever and WEVER to TIP3': ${everTIP3.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });