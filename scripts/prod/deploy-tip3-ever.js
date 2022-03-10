const { Command } = require('commander');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('prompts');

const fs = require('fs');
const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

async function main() {
    const keyPairs = await locklift.keys.getKeyPairs();
    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-evroot', '--weverroot <wEverRoot>', 'WEVER Root')
        .option('-ewvault', '--wevervault <wEverVault>', 'WEVER Vault');

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

    const response = await prompts(promptsData);
    const weverRoot = options.weverroot || response.weverRoot;
    const weverVault = options.wevervault || response.weverVault;

    const TIP3ToEver = await locklift.factory.getContract('TIP3ToEver');

    let tip3Ever = await locklift.giver.deployContract({
        contract: TIP3ToEver,
        constructorParams: {
            _wEverRoot: weverRoot,
            _wEverVault: weverVault,
        },
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair: keyPairs[0],
    }, locklift.utils.convertCrystal('3', 'nano'));

    logger.log(`'TIP3 to Ever': ${tip3Ever.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });