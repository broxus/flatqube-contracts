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
        .option('-ewvault', '--wevervault <weverVault>', 'WEVER Vault');

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

    const response = await prompts(promptsData);
    const weverRoot_ = options.weverroot || response.weverRoot;
    const weverVault_ = options.wevervault || response.weverVault;

    const signer = await locklift.keystore.getSigner('0');

    const {contract: everTip3} = await locklift.factory.deployContract({
        contract: 'EverToTip3',
        // @ts-ignore
        constructorParams: { },
        // @ts-ignore
        initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot_,
            weverVault: weverVault_,
        },
        publicKey: signer!.publicKey,
        value: toNano(2),
    });

    logger.log(`'Ever to Tip3': ${everTip3.address}`);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
