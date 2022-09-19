const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, afterRun, Constants, displayTx} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();
const migration = new Migration();

program
    .allowUnknownOption()
    .option('-r, --roots <roots>', 'pool tokens list')
    .option('-a, --account <account>', 'dex account number')
    .option('-ig, --ignore_already_added <ignore_already_added>', 'ignore already added check')
    .option('-cn, --contract_name <contract_name>', 'DexPair contract name');

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots ? JSON.parse(options.roots) : ['foo', 'bar', 'qwe'];
options.account = options.account || 2;
options.ignore_already_added = options.ignore_already_added === 'true';
options.contract_name = options.contract_name || 'DexStablePool';

const tokens = [];
let poolName = '';
for (let item of options.roots) {
    tokens.push(Constants.tokens[item]);
    poolName += Constants.tokens[item].symbol;
}
const N_COINS = options.roots.length;

let DexAccount;
let dexPool;
let dexAccount;
let account;
let token_roots;
let lp_root;
let keyPairs;

async function logGas() {
    await migration.balancesCheckpoint();
    const diff = await migration.balancesLastDiff();
    if (diff) {
        logger.log(`### GAS STATS ###`);
        for (let alias in diff) {
            logger.log(`${alias}: ${diff[alias].gt(0) ? '+' : ''}${diff[alias].toFixed(9)} TON`);
        }
    }
}

describe('Check DexAccount add Pool', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();
        DexAccount = await locklift.factory.getContract('DexAccount');
        account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account' + options.account);
        if (locklift.tracing) {
            locklift.tracing.allowCodes({compute: [100]});
        }
        account.afterRun = afterRun;
        dexAccount = migration.load(DexAccount, 'DexAccount' + options.account);
        dexPool = migration.load(await locklift.factory.getContract(options.contract_name), 'DexPool' + poolName);
        let dexPoolRoots = await dexPool.call({method: 'getTokenRoots'});
        token_roots = dexPoolRoots.roots;
        lp_root = dexPoolRoots.lp;
        await migration.balancesCheckpoint();
    })

    if (!options.ignore_already_added) {
        describe('Check pool not added already', async function () {
            it('Check DexAccount pool wallets', async function () {
                for (let i = 0; i < N_COINS; i++) {
                    expect((await dexAccount.call({method: 'getWalletData', params: {token_root: token_roots[i]}})).wallet)
                        .to
                        .equal(locklift.ton.zero_address, 'DexAccount wallet address for' + tokens[i].symbol + 'Root is not empty');
                }
                expect((await dexAccount.call({method: 'getWalletData', params: {token_root: lp_root}})).wallet)
                    .to
                    .equal(locklift.ton.zero_address, 'DexAccount wallet address for LPRoot is not empty');
            });
        });
    }
    describe('Add new DexPool to DexAccount', async function () {
        before('Adding new pool', async function () {
            let tx = await account.runTarget({
                contract: dexAccount,
                method: 'addPool',
                params: {
                    _roots: token_roots
                },
                value: locklift.utils.convertCrystal(3.1, 'nano'),
                keyPair: keyPairs[options.account - 1]
            });
            displayTx(tx);
            await afterRun();
            await logGas();
        });
        it('Check ' + poolName + ' pool in DexAccount' + options.account, async function () {
            for (let i = 0; i < N_COINS; i++) {
                expect((await dexAccount.call({method: 'getWalletData', params: {token_root: token_roots[i]}})).wallet)
                    .to
                    .not.equal(locklift.ton.zero_address, 'DexAccount wallet address for ' + tokens[i].symbol + 'Root is empty');
            }
            expect((await dexAccount.call({method: 'getWalletData', params: {token_root: lp_root}})).wallet)
                .to
                .not.equal(locklift.ton.zero_address, 'DexAccount wallet address for LPRoot is empty');
        });
    });
});
