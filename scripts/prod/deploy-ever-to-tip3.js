const { Command } = require('commander');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('prompts');

const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

async function main() {
    const [keyPair] = await locklift.keys.getKeyPairs();
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
    const wEverVault_ = options.wevervault || response.wEverRoot;

    const EverToTip3 = await locklift.factory.getContract('EverToTip3');

    let everTip3 = await locklift.giver.deployContract({
        contract: EverToTip3,
        constructorParams: {
            _wEverRoot: wEverRoot_,
            _wEverVault: wEverVault_,
        },
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            wEverWallet_: locklift.utils.zeroAddress,
        },
        keyPair,
    }, locklift.utils.convertCrystal('3', 'nano'));

    logger.log(`'Ever to Tip3': ${everTip3.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });