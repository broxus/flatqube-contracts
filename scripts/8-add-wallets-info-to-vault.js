const {Migration, afterRun, displayTx} = require(process.cwd()+'/scripts/utils');

async function processTokenWallets() {
    console.log('8-add-wallets-info-to-vault.js');

    const migration = new Migration();
    const keyPairs = await locklift.keys.getKeyPairs();
    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;

    const pairsAddresses = migration.getAddressesByName('DexPairPrev')
    const DexVault = migration.load(await locklift.factory.getContract('DexVaultPrev'), 'DexVault');

    let dexVaultWallets = {};

    async function addToken(addr) {
        if(!dexVaultWallets[addr]) {
            console.log('Add ' + addr.toString());
            const tokenRoot = await locklift.factory.getContract('TokenRootUpgradeable')
            tokenRoot.setAddress(addr);
            dexVaultWallets[addr] = await tokenRoot.call({ method: 'walletOf', params: {answerId: 0, walletOwner: DexVault.address} });
        }
    }

    for (const dexPairAddress of pairsAddresses) {
        const DexPair = await locklift.factory.getContract('DexPairPrev');
        DexPair.setAddress(dexPairAddress);
        const roots = await DexPair.call({ method: 'getTokenRoots' });
        await addToken(roots.left);
        await addToken(roots.right);
        await addToken(roots.lp);
    }

    let _tokenRoots = [];
    let _tokenWallets = [];

    for (let tokenRoot in dexVaultWallets) {
        _tokenRoots.push(tokenRoot);
        _tokenWallets.push(dexVaultWallets[tokenRoot]);
    }

    console.log(`DexVault.addVaultWallets`);
    let tx = await account.runTarget({
        contract: DexVault,
        method: 'addVaultWallets',
        params: { _tokenRoots, _tokenWallets},
        keyPair: keyPairs[0]
    });
    displayTx(tx);

    const _vaultWallets = await DexVault.call({method: '_vaultWallets'});

    console.log(`DexVault._vaultWallets.length = ` + Object.keys(_vaultWallets).length);

}

processTokenWallets()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });

