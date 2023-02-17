import {Address, toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd()+'/scripts/utils')
const {Command} = require('commander');
const program = new Command();
const prompts = require('prompts');

const DEFAULT_DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

async function main() {
    console.log('deploy-stable-pool.ts');
    const migration = new Migration();

    const isValidTonAddress = (address: any) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

    const promptsData = [];

    program
        .allowUnknownOption()
        .option('-dr, --dex_root <dex_root>', 'DexRoot')
        .option('-r, --roots <roots>', 'Pool roots')
        .option(`-f, --fee <fee>`, 'Pool fee')
        .option(`-amp, --a_coef <a_coef>`, 'Pool amplification coefficient')

    program.parse(process.argv);

    const options = program.opts();
    options.dex_root = options.dex_root && isValidTonAddress(options.dex_root) ? options.dex_root : undefined;
    options.roots = options.roots ? JSON.parse(options.roots) : undefined;
    options.fee = options.fee ? JSON.parse(options.fee) : undefined;
    options.a_coef = options.a_coef ? JSON.parse(options.a_coef) : undefined;

    let dexRootAddress = '';

    if (migration.exists('DexRoot')) {
        dexRootAddress = migration.getAddress('DexRoot').toString();
    } else {
        dexRootAddress = DEFAULT_DEX_ROOT_ADDRESS;
    }

    if (options.dex_root === undefined) {
        promptsData.push({
            type: 'text',
            name: 'dex_root',
            message: 'DexRoot address',
            initial: dexRootAddress,
            validate: (value: any) => isValidTonAddress(value) ? true : 'Invalid address'
        })
    }

    if (options.roots === undefined) {
        promptsData.push({
            type: 'list',
            name: 'roots',
            message: 'Token roots',
            initial: '',
            separator: ','
        })
    }

    if (options.fee === undefined) {
        promptsData.push({
            type: 'confirm',
            name: 'is_fee',
            message: 'Do you want to set fee params?'
        });

        promptsData.push({
            type: prev => prev ? 'text' : null,
            name: 'fee',
            message: 'Pool fee'
        });
    }

    if (options.a_coef === undefined) {
        promptsData.push({
            type: 'confirm',
            name: 'is_a_coef',
            message: 'Do you want to set amplification coefficient?'
        });

        promptsData.push({
            type: prev => prev ? 'text' : null,
            name: 'a_coef',
            message: 'Pool amplification coefficient'
        })
    }

    const response = await prompts(promptsData);
    dexRootAddress = options.dex_root || response.dex_root;
    const roots = options.roots || (response.roots ? response.roots : undefined);
    const fee = options.fee || (response.fee ? JSON.parse(response.fee) : undefined);
    const a_coef = options.a_coef || (response.a_coef ? JSON.parse(response.a_coef) : undefined);

    console.log('DexRoot', dexRootAddress);

    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', new Address(dexRootAddress));

    const account = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: migration.getAddress('Account1')
    });

    if (locklift.tracing) {
        locklift.tracing.setAllowedCodesForAddress(account.address, {compute: [100]});
    }

    if (roots !== undefined && roots.every((token_root) => isValidTonAddress(token_root))) {
        console.log(`Start deploy pool DexStablePool`);

        const tx = await dexRoot.methods.deployStablePool(
            {
                roots: roots,
                send_gas_to: account.address,
            }).send({
                from: account.address,
                amount: toNano(20)
        });
        displayTx(tx);

        const dexPoolAddress = (await dexRoot.methods.getExpectedPoolAddress({
            answerId: 0,
            _roots: roots
        }).call()).value0;

        console.log(`DexPool address = ${dexPoolAddress}`);

        const DexPool = await locklift.factory.getDeployedContract('DexStablePool', dexPoolAddress);

        // @ts-ignore
        const version = (await DexPool.methods.getVersion({answerId: 0}).call()).version;
        console.log(`DexPool version = ${version}`);

        await new Promise(resolve => setTimeout(resolve, 10000));

        // @ts-ignore
        const active = (await DexPool.methods.isActive({answerId: 0}).call()).value0;
        console.log(`DexPool active = ${active}`);

        console.log(``);

        if (fee !== undefined) {
            console.log(`Update fee params to ${JSON.stringify(fee)}`);
            const tx = await dexRoot.methods.setPairFeeParams(
                {
                    _roots: roots,
                    _params: fee,
                    _remainingGasTo: account.address
                }).send({
                    from: account.address,
                    amount: toNano(5),
                });
            displayTx(tx);
            console.log(``);
        }

        if (a_coef !== undefined) {
            console.log(`Update amplification coefficient to ${JSON.stringify(a_coef)}`);
            const tx = await dexRoot.methods.setPairAmplificationCoefficient(
                {
                    _roots: roots,
                    _A: a_coef,
                    _remainingGasTo: account.address
                }).send({
                    from: account.address,
                    amount: toNano(5),
                });
            displayTx(tx);
            console.log(``);
        }
    } else {
        console.log('Invalid Token Roots Addresses');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
