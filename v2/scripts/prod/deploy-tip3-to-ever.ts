import {getRandomNonce, toNano} from "locklift";

async function main() {
    const { Command } = require('commander');

    const logger = require('mocha-logger');
    const program = new Command();
    const prompts = require('prompts');

    const isValidTonAddress = (address: any) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-evroot', '--weverroot <weverRoot>', 'WEver Root')
        .option('-ewvault', '--wevervault <weverVault>', 'WEver Vault');

    program.parse(process.argv);

    const options = program.opts();

    if (!isValidTonAddress(options.weverroot)) {
        promptsData.push({
            type: 'text',
            name: 'weverRoot',
            message: 'WEver Root',
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    if (!isValidTonAddress(options.wevervault)) {
        promptsData.push({
            type: 'text',
            name: 'weverVault',
            message: 'WEver Vault',
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    const response = await prompts(promptsData);
    const weverRoot_ = options.weverroot || response.weverRoot;
    const weverVault_ = options.wevervault || response.weverVault;

    const signer = await locklift.keystore.getSigner('0');

    const {contract: tip3ToEver} = await locklift.factory.deployContract({
        contract: 'Tip3ToEver',
        // @ts-ignore
        constructorParams: { },
        // @ts-ignore
        initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot_,
            weverVault: weverVault_,
        },
        publicKey: signer!.publicKey,
        value: toNano(2)
    });

    logger.log(`'TIP3 to Ever': ${tip3ToEver.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
