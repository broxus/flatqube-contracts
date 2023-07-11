import { toNano } from "locklift";
import { Migration, Constants, displayTx } from '../utils/migration';

const {expect} = require('chai');
const logger = require('mocha-logger');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
import { Command } from 'commander';
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
options.old_contract_name = options.old_contract_name || 'DexStablePoolPrev';
options.new_contract_name = options.new_contract_name || 'DexStablePool';
options.pool_type = options.pool_type || '1';

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
    referrer_threshold: undefined,
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
    referrer_threshold: undefined,
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
        referrer_threshold: undefined,
        pool_type: undefined,
    };

    data.root = (await pool.methods.getRoot({answerId: 0}).call()).dex_root.toString();
    // data.vault = (await pool.methods.getVault({answerId: 0}).call()).dex_vault.toString();

    data.current_version = (await pool.methods.getVersion({answerId: 0}).call()).version;
    data.platform_code = (await pool.methods.platform_code().call()).platform_code;

    const token_roots = await pool.methods.getTokenRoots({answerId: 0}).call();
    data.lp_root = token_roots.lp.toString();
    data.roots = token_roots.roots.map(root => root.toString());

    data.active = (await pool.methods.isActive({answerId: 0}).call()).value0;

    const token_wallets = await pool.methods.getTokenWallets({answerId: 0}).call();
    data.lp_wallet = token_wallets.lp.toString();
    data.token_wallets = token_wallets.token_wallets.map(wallet => wallet.toString());

    // const vault_token_wallets = await pool.methods.getVaultWallets({answerId: 0}).call();
    // data.lp_vault_wallet = token_wallets.lp.toString();
    // data.vault_wallets = vault_token_wallets.token_vault_wallets.map(wallet => wallet.toString());

    const balances = (await pool.methods.getBalances({answerId: 0}).call()).value0;
    data.lp_supply = balances.lp_supply.toString();
    data.balances = balances.balances.map((bal) => bal.toString());

    const fee_params = (await pool.methods.getFeeParams({answerId: 0}).call()).value0;
    data.fee_pool = new BigNumber(fee_params.pool_numerator).div(fee_params.denominator).times(100).toString();
    data.fee_beneficiary = new BigNumber(fee_params.beneficiary_numerator).div(fee_params.denominator).toString();
    data.fee_referrer = new BigNumber(fee_params.referrer_numerator).div(fee_params.denominator).times(100).toString();
    data.fee_beneficiary_address = fee_params.beneficiary.toString();
    data.threshold = fee_params.threshold;
    data.referrer_threshold = fee_params.referrer_threshold;
    data.pool_type = Number((await pool.methods.getPoolType({answerId: 0}).call()).value0);

    return data;
}

console.log(``);
console.log(`##############################################################################################`);
console.log(`35-upgrade-pool.js`);
console.log(`OPTIONS: `, options);

describe('Test Dex Pool contract upgrade', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {
        account = await migration.loadAccount('Account1', '0');
        dexRoot = migration.loadContract('DexRoot', 'DexRoot');
        dexPool = migration.loadContract(options.old_contract_name, 'DexPool' + poolName);

        targetVersion = (await dexRoot.methods.getPoolVersion({ answerId: 0, pool_type: options.pool_type }).call()).value0;

        tokenRoots = {};
        for (let item of options.roots) {
            tokenRoots[item] = migration.loadContract('TokenRootUpgradeable', tokens[item].symbol + 'Root');
        }

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

        const tx = await locklift.transactions.waitFinalized(dexRoot.methods.upgradePool(
            {
                roots: roots,
                send_gas_to: account.address,
                pool_type: options.pool_type
            }
        ).send({
            from: account.address,
            amount: toNano(6)
        }));

        console.log(`##########################`);
        displayTx(tx);
        console.log(`##########################`);

        NewVersionContract = await locklift.factory.getDeployedContract(options.new_contract_name, dexPool.address);
        newPoolData = await loadPoolData(NewVersionContract, options.new_contract_name);
        logger.log(`New Pool(${NewVersionContract.address}) data:\n${JSON.stringify(newPoolData, null, 4)}`);
    })
    describe('Check DexPool after upgrade', async function () {
        it('Check All data correct installed in new contract', async function () {
            expect(newPoolData.root)
                .to
                .equal(oldPoolData.root, 'New root value incorrect');
            // expect(newPoolData.vault)
            //     .to
            //     .equal(oldPoolData.vault, 'New vault value incorrect');
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
            // for (let i = 0; i < N_COINS; i++) {
            //     expect(newPoolData.vault_wallets[i])
            //         .to
            //         .equal(oldPoolData.vault_wallets[i], `New ${tokens[options.roots[i]].symbol} vault wallet value incorrect`);
            // }
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
