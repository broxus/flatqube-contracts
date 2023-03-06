import {toNano} from "locklift";
import { Migration, Constants, displayTx } from '../utils/migration';

const { Command } = require('commander');
const program = new Command();

async function main() {
    console.log('5-deploy-test-pool.js');
    const migration = new Migration();

    const account = await migration.loadAccount('Account1', '0');

    if (locklift.tracing) {
        locklift.tracing.setAllowedCodesForAddress(account.address, {compute: [100]});
    }

    const dexRoot = await migration.loadContract('DexRoot', 'DexRoot');

    program
        .allowUnknownOption()
        .option('-p, --pools <pools>', 'pools to deploy')
        .option('-cn, --contract_name <contract_name>', 'New version of contract name');

    program.parse(process.argv);

    const options = program.opts();
    options.contract_name = options.contract_name || 'DexStablePool';

    const pools = options.pools ? JSON.parse(options.pools) : [['foo', 'bar', 'qwe']];

    for (const p of pools) {

        const N_COINS = p.length;

        const tokens = [];
        let poolName = '';
        for (let item of p) {
            tokens.push(Constants.tokens[item]);
            poolName += Constants.tokens[item].symbol;
        }

        console.log(`Start deploy pool DexStablePool${poolName}`);

        const tokenContracts = [];
        const tokenAddresses = [];

        for (let token of tokens) {
            const tokenContract = await migration.loadContract(
                token.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot', token.symbol + 'Root');
            tokenContracts.push(tokenContract);
            tokenAddresses.push(tokenContract.address);
        }

        const tx = await dexRoot.methods.deployStablePool(
            {
                roots: tokenAddresses,
                send_gas_to: account.address,
            }
        ).send({
            from: account.address,
            amount: toNano(20)
        });

        displayTx(tx);

        const dexPoolAddress = (await dexRoot.methods.getExpectedPoolAddress({
            answerId: 0,
            _roots: tokenAddresses
        }).call()).value0;

        console.log(`DexPool${poolName}: ${dexPoolAddress}`);

        const DexPool = await locklift.factory.getDeployedContract(options.contract_name, dexPoolAddress);
        migration.store(DexPool, 'DexPool' + poolName);

        // @ts-ignore
        const version = (await DexPool.methods.getVersion({answerId: 0}).call()).version;
        console.log(`DexPool${poolName} version = ${version}`);

        await new Promise(resolve => setTimeout(resolve, 10000));

        // @ts-ignore
        const active = (await DexPool.methods.isActive({answerId: 0}).call()).value0;
        console.log(`DexPool${poolName} active = ${active}`);

        const DexPoolLpRoot = await locklift.factory.getDeployedContract(
            'TokenRootUpgradeable',
            // @ts-ignore
            (await DexPool.methods.getTokenRoots({answerId: 0}).call()).lp
        );

        migration.store(DexPoolLpRoot, poolName + 'LpRoot');

        for (let i = 0; i < N_COINS; i++) {
            const tokenWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
                (await tokenContracts[i].methods.walletOf({
                    answerId: 0,
                    walletOwner: dexPoolAddress,
                }).call()).value0
            );

            migration.store(tokenWallet, poolName + 'Pool_' + tokens[i].symbol + 'Wallet');

            const coinTokenVault = (await dexRoot.methods.getExpectedTokenVaultAddress({
                answerId: 0,
                _tokenRoot: tokenAddresses[i]
            }).call()).value0;

            const tokenVaultWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
                (await tokenContracts[i].methods.walletOf({
                    answerId: 0,
                    walletOwner: coinTokenVault.toString()
                }).call()).value0
            );

            migration.store(tokenVaultWallet, tokens[i].symbol + 'VaultWallet');
        }

        const DexPoolLpPoolWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await DexPoolLpRoot.methods.walletOf({
                answerId: 0,
                walletOwner: dexPoolAddress,
            }).call()).value0
        );

        migration.store(DexPoolLpPoolWallet, poolName + 'Pool_LpWallet');

        const dexPoolLpTokenVault = (await dexRoot.methods.getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: DexPoolLpRoot.address
        }).call()).value0;

        const DexPoolLpVaultWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await DexPoolLpRoot.methods.walletOf({
                answerId: 0,
                walletOwner: dexPoolLpTokenVault.toString()
            }).call()).value0
        );

        migration.store(DexPoolLpVaultWallet, poolName + 'LpVaultWallet');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
