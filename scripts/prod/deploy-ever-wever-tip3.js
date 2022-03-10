const { Command } = require('commander');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('prompts');

const fs = require('fs');
const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

async function main() {
    const [keyPair] = await locklift.keys.getKeyPairs();
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
            message: 'Swap Ever contract',
            validate: value => isValidTonAddress(value) ? true : 'Invalid TON address'
        })
    }

    const response = await prompts(promptsData);
    const weverRoot = options.weverroot || response.weverRoot;
    const weverVault = options.wevervault || response.weverVault;
    const swapEver = options.swapever || response.swapEver;

    const EverWEverToTIP3 = await locklift.factory.getContract('EverWEverToTIP3');

    let everWEverToTIP3 = await locklift.giver.deployContract({
        contract: EverWEverToTIP3,
        constructorParams: {
            _wEverRoot: weverRoot,
            _wEverVault: weverVault,
            _swapEver: swapEver,
        },
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            wEverWallet: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('3', 'nano'));

    logger.log(`'Ever and WEVER to TIP3': ${everWEverToTIP3.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });