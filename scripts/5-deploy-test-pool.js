const {Migration, TOKEN_CONTRACTS_PATH, Constants, afterRun, displayTx} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

async function main() {
    console.log('5-deploy-test-pool.js');
    const migration = new Migration();
    const [keyPair] = await locklift.keys.getKeyPairs();

    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');

    if (locklift.tracing) {
        locklift.tracing.allowCodes({compute: [100]});
    }

    const dexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');
    const dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');

    account.afterRun = afterRun;

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
            const tokenContract = migration.load(await locklift.factory.getContract(
                token.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot',
                TOKEN_CONTRACTS_PATH
            ), token.symbol + 'Root');
            tokenContracts.push(tokenContract);
            tokenAddresses.push(tokenContract.address);
        }

        const tx = await account.runTarget({
            contract: dexRoot,
            method: 'deployStablePool',
            params: {
                roots: tokenAddresses,
                send_gas_to: account.address,
            },
            value: locklift.utils.convertCrystal(20, 'nano'),
            keyPair: keyPair
        });

        displayTx(tx);

        await afterRun();

        const dexPoolAddress = await dexRoot.call({
            method: 'getExpectedPoolAddress',
            params: {
                '_roots': tokenAddresses
            }
        })

        console.log(`DexPool${poolName}: ${dexPoolAddress}`);

        const DexPool = await locklift.factory.getContract(options.contract_name);
        DexPool.address = dexPoolAddress;
        migration.store(DexPool, 'DexPool' + poolName);

        const version = await DexPool.call({method: "getVersion", params: {}})
        console.log(`DexPool${poolName} version = ${version}`);

        // await new Promise(resolve => setTimeout(resolve, 10000));

        const active = await DexPool.call({method: "isActive", params: {}})
        console.log(`DexPool${poolName} active = ${active}`);

        const DexPoolLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        DexPoolLpRoot.setAddress((await DexPool.call({method: "getTokenRoots"})).lp);

        migration.store(DexPoolLpRoot, poolName + 'LpRoot');

        for (let i = 0; i < N_COINS; i++) {
            const tokenWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
            tokenWallet.setAddress(await tokenContracts[i].call({
                method: "walletOf",
                params: {
                    walletOwner: dexPoolAddress,
                }
            }));

            migration.store(tokenWallet, poolName + 'Pool_' + tokens[i].symbol + 'Wallet');

            const coinTokenVault = await dexRoot.call({
                method: 'getExpectedTokenVaultAddress',
                params: { _tokenRoot: tokenAddresses[i] },
            });

            const tokenVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
            tokenVaultWallet.setAddress(await tokenContracts[i].call({
                method: "walletOf",
                params: {
                    walletOwner: coinTokenVault,
                }
            }));

            migration.store(tokenVaultWallet, tokens[i].symbol + 'VaultWallet');
        }

        const DexPoolLpPoolWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        DexPoolLpPoolWallet.setAddress(await DexPoolLpRoot.call({
            method: "walletOf",
            params: {
                walletOwner: dexPoolAddress,
            }
        }));

        migration.store(DexPoolLpPoolWallet, poolName + 'Pool_LpWallet');

        const lpTokenVault = await dexRoot.call({
            method: 'getExpectedTokenVaultAddress',
            params: { _tokenRoot: DexPoolLpRoot.address },
        });

        const DexPoolLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        DexPoolLpVaultWallet.setAddress(await DexPoolLpRoot.call({
            method: "walletOf",
            params: {
                walletOwner: lpTokenVault,
            }
        }));

        migration.store(DexPoolLpVaultWallet, poolName + 'LpVaultWallet');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
