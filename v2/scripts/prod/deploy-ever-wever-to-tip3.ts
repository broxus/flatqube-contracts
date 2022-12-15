import {Command} from "commander";


async function main() {
    const { Command } = require('commander');

    const logger = require('mocha-logger');
    const program = new Command();
    const prompts = require('prompts');
    const {getRandomNonce, toNano} = require("locklift");

    const isValidTonAddress = (address: any) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-evroot', '--weverroot <weverRoot>', 'WEVER Root')
        .option('-ewvault', '--wevervault <weverVault>', 'WEVER Vault')
        .option('-evertotip3', '--evertotip3 <everToTip3>', 'Swap Ever to Tip3 contract');

    program.parse(process.argv);

    const options = program.opts();

    if (!isValidTonAddress(options.weverroot)) {
        promptsData.push({
            type: 'text',
            name: 'weverRoot',
            message: 'WEVER Root',
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    if (!isValidTonAddress(options.wevervault)) {
        promptsData.push({
            type: 'text',
            name: 'weverVault',
            message: 'WEVER Vault',
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    if (!isValidTonAddress(options.evertotip3)) {
        promptsData.push({
            type: 'text',
            name: 'everToTip3',
            message: 'Swap Ever contract',
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    const response = await prompts(promptsData);
    const weverRoot_ = options.weverroot || response.weverRoot;
    const weverVault_ = options.wevervault || response.weverVault;
    const everToTip3_ = options.evertotip3 || response.everToTip3;

    const signer = await locklift.keystore.getSigner('0');

    const {contract: everWeverToTip3} = await locklift.factory.deployContract({
        contract: 'EverWeverToTip3',
        // @ts-ignore
        constructorParams: { },
        // @ts-ignore
        initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot_,
            weverVault: weverVault_,
            everToTip3: everToTip3_
        },
        publicKey: signer!.publicKey,
        value: toNano(2)
    });

    logger.log(`'Ever and Wever to Tip3': ${everWeverToTip3.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
