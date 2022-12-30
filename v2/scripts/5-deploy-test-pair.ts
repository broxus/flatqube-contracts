import {toNano, WalletTypes} from "locklift";

const {Migration, Constants, displayTx} = require(process.cwd() + '/scripts/utils')
const {Command} = require('commander');
const program = new Command();

async function main() {
    console.log('5-deploy-test-pair.js');
    const migration = new Migration();

    const account2 = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: migration.getAddress('Account2')
    });

    if (locklift.tracing) {
        locklift.tracing.setAllowedCodesForAddress(account2.address, {compute: [100]});
    }

    const dexVault = await locklift.factory.getDeployedContract('DexVault', migration.getAddress('DexVault'));
    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));

    program
        .allowUnknownOption()
        .option('-p, --pairs <pairs>', 'pairs to deploy')
        .option('-cn, --contract_name <contract_name>', 'New version of contract name');

    program.parse(process.argv);

    const options = program.opts();
    options.contract_name = options.contract_name || 'DexPair';

    const pairs = options.pairs ? JSON.parse(options.pairs) : [['foo', 'bar']];

    for (const p of pairs) {

        const tokenLeft = p[0].slice(-2) === 'Lp' ? {
            name: p[0],
            symbol: p[0],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true
        } : Constants.tokens[p[0]];
        const tokenRight = p[1].slice(-2) === 'Lp' ? {
            name: [p[1]],
            symbol: p[1],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true
        } : Constants.tokens[p[1]];

        const pair = {left: tokenLeft.symbol, right: tokenRight.symbol};

        console.log(`Start deploy pair DexPair${pair.left}${pair.right}`);

        const tokenFoo = await locklift.factory.getDeployedContract(
            tokenLeft.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot', migration.getAddress(pair.left + 'Root'));
        const tokenBar = await locklift.factory.getDeployedContract(
            tokenRight.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot', migration.getAddress(pair.right + 'Root'));

        const tx = await dexRoot.methods.deployPair(
            {
                left_root: tokenFoo.address,
                right_root: tokenBar.address,
                send_gas_to: account2.address,
            }
        ).send({
            from: account2.address,
            amount: toNano(10)
        });

        displayTx(tx);

        const dexPairFooBarAddress = (await dexRoot.methods.getExpectedPairAddress({
            'answerId': 0,
            'left_root': tokenFoo.address,
            'right_root': tokenBar.address,
        }).call()).value0;

        console.log(`DexPair${pair.left}${pair.right}: ${dexPairFooBarAddress}`);


        const dexPairFooBar = await locklift.factory.getDeployedContract(options.contract_name, dexPairFooBarAddress);
        migration.store(dexPairFooBar, 'DexPair' + pair.left + pair.right);

        // @ts-ignore
        const version = (await dexPairFooBar.methods.getVersion({answerId: 0}).call()).version;
        console.log(`DexPair${pair.left}${pair.right} version = ${version}`);

        // @ts-ignore
        const active = (await dexPairFooBar.methods.isActive({answerId: 0}).call()).value0;
        console.log(`DexPair${pair.left}${pair.right} active = ${active}`);

        // @ts-ignore
        const FooBarLpRoot = await locklift.factory.getDeployedContract('TokenRootUpgradeable', (await dexPairFooBar.methods.getTokenRoots({answerId: 0}).call()).lp);

        const FooPairWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await tokenFoo.methods.walletOf({
                answerId: 0,
                walletOwner: dexPairFooBarAddress,
            }).call()).value0
        );

        const BarPairWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await tokenBar.methods.walletOf({
                answerId: 0,
                walletOwner: dexPairFooBarAddress,
            }).call()).value0
        );

        const FooBarLpPairWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await FooBarLpRoot.methods.walletOf({
                answerId: 0,
                walletOwner: dexPairFooBarAddress,
            }).call()).value0
        );

        const FooVaultWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await tokenFoo.methods.walletOf({
                answerId: 0,
                walletOwner: dexVault.address,
            }).call()).value0
        );

        const BarVaultWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await tokenBar.methods.walletOf({
                answerId: 0,
                walletOwner: dexVault.address,
            }).call()).value0
        );

        const FooBarLpVaultWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable',
            (await FooBarLpRoot.methods.walletOf({
                answerId: 0,
                walletOwner: dexVault.address,
            }).call()).value0
        );

        migration.store(FooBarLpRoot, pair.left + pair.right + 'LpRoot');
        migration.store(FooPairWallet, pair.left + pair.right + 'Pair_' + pair.left + 'Wallet');
        migration.store(BarPairWallet, pair.left + pair.right + 'Pair_' + pair.right + 'Wallet');
        migration.store(FooBarLpPairWallet, pair.left + pair.right + 'Pair_LpWallet');
        migration.store(FooVaultWallet, pair.left + 'VaultWallet');
        migration.store(BarVaultWallet, pair.right + 'VaultWallet');
        migration.store(FooBarLpVaultWallet, pair.left + pair.right + 'LpVaultWallet');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
