
const {expect} = require('chai');
const logger = require('mocha-logger');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const {Migration, TOKEN_CONTRACTS_PATH, afterRun, Constants, displayTx} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-r, --roots <roots>', 'pool roots')
    .option('-ocn, --old_contract_name <old_contract_name>', 'Old DexPool contract name')
    .option('-ncn, --new_contract_name <new_contract_name>', 'New DexPool contract name')
    .option('-pt, --pool_type <pool_type>', 'Pool type');

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots ? JSON.parse(options.roots) : ['foo', 'bar', 'qwe'];
options.old_contract_name = options.old_contract_name || 'DexPairPrev';
options.new_contract_name = options.new_contract_name || 'DexPair';
options.pool_type = options.pool_type || '1';

const tokenLeft = Constants.tokens[options.left];
const tokenRight = Constants.tokens[options.right];

const tokens = {};
let poolName = '';
for (let item of options.roots) {
    tokens[item] = Constants.tokens[item];
    poolName += Constants.tokens[item].symbol;
}
const N_COINS = options.roots.length;

let NewVersionContract;

let account;
let tokenRoots;
let dexRoot;
let dexPool;

let targetVersion: number;

let oldPoolData = {
    root: undefined,
    vault: undefined,
    current_version: undefined,
    platform_code: undefined,
    lp_root: undefined,
    roots: undefined,
    active: undefined,
    lp_wallet: undefined,
    token_wallets: undefined,
    lp_vault_wallet: undefined,
    vault_wallets: undefined,
    lp_supply: undefined,
    balances: undefined,
    fee_pool: undefined,
    fee_beneficiary: undefined,
    fee_referrer: undefined,
    fee_beneficiary_address: undefined,
    threshold: undefined,
    pool_type: undefined,
};
let newPoolData = {
    root: undefined,
    vault: undefined,
    current_version: undefined,
    platform_code: undefined,
    lp_root: undefined,
    roots: undefined,
    active: undefined,
    lp_wallet: undefined,
    token_wallets: undefined,
    lp_vault_wallet: undefined,
    vault_wallets: undefined,
    lp_supply: undefined,
    balances: undefined,
    fee_pool: undefined,
    fee_beneficiary: undefined,
    fee_referrer: undefined,
    fee_beneficiary_address: undefined,
    threshold: undefined,
    pool_type: undefined,
};

const loadPoolData = async (pool, contractName: string) => {
    const data = {
        root: undefined,
        vault: undefined,
        current_version: undefined,
        platform_code: undefined,
        lp_root: undefined,
        roots: undefined,
        active: undefined,
        lp_wallet: undefined,
        token_wallets: undefined,
        lp_vault_wallet: undefined,
        vault_wallets: undefined,
        lp_supply: undefined,
        balances: undefined,
        fee_pool: undefined,
        fee_beneficiary: undefined,
        fee_referrer: undefined,
        fee_beneficiary_address: undefined,
        threshold: undefined,
        pool_type: undefined,
    };

    data.root = await pool.call({method: 'getRoot'});
    data.vault = await pool.call({method: 'getVault'});

    data.current_version = (await pool.call({method: 'getVersion'})).toString();
    data.platform_code = await pool.call({method: 'platform_code'});

    const token_roots = await pool.call({method: 'getTokenRoots'});
    data.lp_root = token_roots.lp;
    data.roots = token_roots.roots;

    data.active = await pool.call({method: 'isActive'});

    const token_wallets = await pool.call({method: 'getTokenWallets'});
    data.lp_wallet = token_wallets.lp;
    data.token_wallets = token_wallets.token_wallets;

    const vault_token_wallets = await pool.call({method: 'getVaultWallets'});
    data.lp_vault_wallet = token_wallets.lp;
    data.vault_wallets = vault_token_wallets.token_vault_wallets;

    const balances = await pool.call({method: 'getBalances'});
    data.lp_supply = balances.lp_supply.toString();
    data.balances = balances.balances.map((bal) => bal.toString());

    const fee_params = await pool.call({method: 'getFeeParams'});
    data.fee_pool = fee_params.pool_numerator.div(fee_params.denominator).times(100).toString();
    data.fee_beneficiary = fee_params.beneficiary_numerator.div(fee_params.denominator).times(100).toString();
    data.fee_referrer = fee_params.referrer_numerator.div(fee_params.denominator).times(100).toString();
    data.fee_beneficiary_address = fee_params.beneficiary;
    data.threshold = fee_params.threshold;
    data.pool_type = (await pool.call({method: 'getPoolType'})).toNumber();

    return data;
}

console.log(``);
console.log(`##############################################################################################`);
console.log(`35-upgrade-pool.js`);
console.log(`OPTIONS: `, options);

describe('Test Dex Pool contract upgrade', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {
        account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        account.afterRun = afterRun;
        dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
        dexPool = migration.load(await locklift.factory.getContract(options.old_contract_name), 'DexPool' + poolName);
        NewVersionContract = await locklift.factory.getContract(options.new_contract_name);

        targetVersion = new BigNumber(await dexRoot.call({method: 'getPoolVersion', params: {pool_type: options.pool_type}})).toNumber();

        tokenRoots = {};
        for (let item of options.roots) {
            tokenRoots[item] = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), tokens[item].symbol + 'Root');
        }

        const [keyPair] = await locklift.keys.getKeyPairs();

        oldPoolData = await loadPoolData(dexPool, options.old_contract_name);
        logger.log(`Old Pool(${dexPool.address}) data:\n${JSON.stringify(oldPoolData, null, 4)}`);
        let logs = `Upgrading DexPool contract:\n`;
        for (let item of options.roots) {
            logs += `- ${tokens[item].symbol}=${tokenRoots[item].address}\n`
        }
        logs += `- current version = ${oldPoolData.current_version}
        - current pool_type = ${oldPoolData.pool_type}
        - target version = ${targetVersion}
        - target pool_type = ${options.pool_type}`;

        let roots = [];
        for (let item of options.roots) {
            roots.push(tokenRoots[item].address);
        }

        const tx = await account.runTarget({
            contract: dexRoot,
            method: 'upgradePool',
            params: {
                roots: roots,
                send_gas_to: account.address,
                pool_type: options.pool_type
            },
            value: locklift.utils.convertCrystal(6, 'nano'),
            keyPair
        });

        console.log(`##########################`);
        displayTx(tx);
        console.log(`##########################`);

        NewVersionContract.setAddress(dexPool.address);
        newPoolData = await loadPoolData(NewVersionContract, options.new_contract_name);
        logger.log(`New Pool(${NewVersionContract.address}) data:\n${JSON.stringify(newPoolData, null, 4)}`);
    })
    describe('Check DexPool after upgrade', async function () {
        it('Check All data correct installed in new contract', async function () {
            expect(newPoolData.root)
                .to
                .equal(oldPoolData.root, 'New root value incorrect');
            expect(newPoolData.vault)
                .to
                .equal(oldPoolData.vault, 'New vault value incorrect');
            expect(newPoolData.platform_code)
                .to
                .equal(oldPoolData.platform_code, 'New platform_code value incorrect');
            expect(newPoolData.current_version.toString())
                .to
                .equal(targetVersion.toString(), 'New current_version value incorrect');
            expect(newPoolData.pool_type.toString())
                .to
                .equal(options.pool_type, 'New current_version value incorrect');
            expect(newPoolData.lp_root)
                .to
                .equal(oldPoolData.lp_root, 'New lp_root value incorrect');
            for (let i = 0; i < N_COINS; i++) {
                expect(newPoolData.roots[i])
                    .to
                    .equal(oldPoolData.roots[i], `New ${tokens[options.roots[i]].symbol} root value incorrect`);
            }
            expect(newPoolData.active)
                .to
                .equal(oldPoolData.active, 'New active value incorrect');
            expect(newPoolData.lp_wallet)
                .to
                .equal(oldPoolData.lp_wallet, 'New lp_wallet value incorrect');
            for (let i = 0; i < N_COINS; i++) {
                expect(newPoolData.token_wallets[i])
                    .to
                    .equal(oldPoolData.token_wallets[i], `New ${tokens[options.roots[i]].symbol} wallet value incorrect`);
            }
            for (let i = 0; i < N_COINS; i++) {
                expect(newPoolData.vault_wallets[i])
                    .to
                    .equal(oldPoolData.vault_wallets[i], `New ${tokens[options.roots[i]].symbol} vault wallet value incorrect`);
            }
            expect(newPoolData.lp_supply)
                .to
                .equal(oldPoolData.lp_supply, 'New lp_supply value incorrect');
            for (let i = 0; i < N_COINS; i++) {
                expect(newPoolData.balances[i])
                    .to
                    .equal(oldPoolData.balances[i], `New ${tokens[options.roots[i]].symbol} balance value incorrect`);
            }

            expect(newPoolData.fee_pool)
                .to
                .equal(oldPoolData.fee_pool, 'New fee_pool value incorrect');

            expect(newPoolData.fee_beneficiary)
                .to
                .equal(oldPoolData.fee_beneficiary, 'New fee_beneficiary value incorrect');

            expect(newPoolData.fee_beneficiary_address)
                .to
                .equal(oldPoolData.fee_beneficiary_address, 'New fee beneficiary value incorrect');

            expect(newPoolData.fee_referrer)
                .to
                .equal(oldPoolData.fee_referrer, 'New fee referrer value incorrect');
        });
    });
});
