import {toNano, WalletTypes} from "locklift";
import {Account} from "everscale-standalone-client/nodejs";
import {Contract} from "everscale-inpage-provider";
import {DexRootAbi, DexStablePoolAbi} from "../../build/factorySource";
import {ContractData} from "locklift/internal/factory";

const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, Constants} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const { Command } = require('commander');
const program = new Command();

const migration = new Migration();

let account: Account;
let NextVersionContract: ContractData<DexStablePoolAbi>;
let dexRoot: Contract<DexRootAbi>;

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
        account = await locklift.factory.accounts.addExistingAccount({
            type: WalletTypes.EverWallet,
            address: migration.getAddress('Account1')
        });

        dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));

        logger.log(`New contract version: ${options.contract_name}`);
        NextVersionContract = await locklift.factory.getContractArtifacts(options.contract_name);
    })
    describe('Install DexPool code', async function () {
        it('Check code version', async function () {
            let startVersion = '0';
            try {
                startVersion = (await dexRoot.methods.getPoolVersion({ answerId: 0, pool_type: options.pool_type }).call()).value0;
            } catch (e) {}
            logger.log(`Start DexPool code version: ${startVersion}`);

            logger.log(`Installing new DexPool contract in DexRoot: ${dexRoot.address}`);
            await dexRoot.methods.installOrUpdatePoolCode({code: NextVersionContract.code, pool_type: options.pool_type}).send({
                from: account.address,
                amount: toNano(5),
            });

            const endVersion = (await dexRoot.methods.getPoolVersion({ answerId: 0, pool_type: options.pool_type }).call()).value0;
            logger.log(`End DexPool code version: ${endVersion}`);

            expect(new BigNumber(startVersion).plus(1).toString())
                .to
                .equal(new BigNumber(endVersion).toString(), 'DexPool code version incorrect');
        });
    });
});
