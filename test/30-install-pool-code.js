const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, afterRun, Constants} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const { Command } = require('commander');
const program = new Command();

const migration = new Migration();

let keyPair;
let account;
let NextVersionContract;
let dexRoot;

program
    .allowUnknownOption()
    .option('-cn, --contract_name <contract_name>', 'New version of contract name')
    .option('-pt, --pool_type <pool_type>', 'Pool type');

program.parse(process.argv);

const options = program.opts();

options.contract_name = options.contract_name || 'DexStablePool';
options.pool_type = options.pool_type || 3;

console.log(``);
console.log(`##############################################################################################`);
console.log(`30-install-pool-code.js`);
console.log(`OPTIONS: `, options);

describe('Test Dex Pool contract upgrade', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {
        account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        account.afterRun = afterRun;
        dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
        logger.log(`New contract version: ${options.contract_name}`);
        NextVersionContract = await locklift.factory.getContract(options.contract_name);

        [keyPair] = await locklift.keys.getKeyPairs();

    })
    describe('Install DexPool code', async function () {
        it('Check code version', async function () {
            let startVersion = 0;
            try {
                startVersion = await dexRoot.call({method: 'getPoolVersion', params: { pool_type: options.pool_type }});
            } catch (e) {}
            logger.log(`Start DexPool code version: ${startVersion}`);

            logger.log(`Installing new DexPool contract in DexRoot: ${dexRoot.address}`);
            await account.runTarget({
                contract: dexRoot,
                method: 'installOrUpdatePoolCode',
                params: {code: NextVersionContract.code, pool_type: options.pool_type},
                value: locklift.utils.convertCrystal(5, 'nano'),
                keyPair
            });

            const endVersion = await dexRoot.call({method: 'getPoolVersion', params: { pool_type: options.pool_type }});
            logger.log(`End DexPool code version: ${endVersion}`);

            expect(new BigNumber(startVersion).plus(1).toString())
                .to
                .equal(new BigNumber(endVersion).toString(), 'DexPool code version incorrect');
        });
    });
});
