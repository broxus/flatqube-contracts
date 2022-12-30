import {WalletTypes, toNano} from "locklift";

const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, Constants} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const { Command } = require('commander');
const program = new Command();
import {Account} from "everscale-standalone-client/nodejs";
import {Contract} from "everscale-inpage-provider";
import {DexPairAbi, DexRootAbi} from "../../build/factorySource";
import {ContractData} from "locklift/internal/factory";

const migration = new Migration();

let account: Account;
let NextVersionContract: ContractData<DexPairAbi>;
let dexRoot: Contract<DexRootAbi>;

program
    .allowUnknownOption()
    .option('-cn, --contract_name <contract_name>', 'New version of contract name')
    .option('-pt, --pool_type <pool_type>', 'Pool type');

program.parse(process.argv);

const options = program.opts();

options.contract_name = options.contract_name || 'DexPair';
options.pool_type = options.pool_type || 1;

console.log(``);
console.log(`##############################################################################################`);
console.log(`30-install-pair-code-v2.js`);
console.log(`OPTIONS: `, options);

describe('Test Dex Pair contract upgrade', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {

        account = await locklift.factory.accounts.addExistingAccount({
            type: WalletTypes.EverWallet,
            address: migration.getAddress('Account1')
        });

        dexRoot = await locklift.factory.getDeployedContract( 'DexRoot', migration.getAddress('DexRoot'));

        logger.log(`New contract version: ${options.contract_name}`);
        NextVersionContract = await locklift.factory.getContractArtifacts(options.contract_name);
    })
    describe('Install DexPair code', async function () {
        it('Check code version', async function () {
            let startVersion = '0';
            try {
                startVersion = (await dexRoot.methods.getPairVersion({ answerId: 0, pool_type: options.pool_type }).call()).value0;
            } catch (e) {}
            logger.log(`Start DexPair code version: ${startVersion}`);

            // @ts-ignore
            logger.log(`Installing new DexPair contract in DexRoot: ${dexRoot.address}`);
            // @ts-ignore
            await dexRoot.methods.installOrUpdatePairCode({code: NextVersionContract.code, pool_type: options.pool_type}).send({
                from: account.address,
                amount: toNano(5),
            });

            let endVersion = (await dexRoot.methods.getPairVersion({ answerId: 0, pool_type: options.pool_type }).call()).value0;
            logger.log(`End DexPair code version: ${endVersion}`);

            expect(new BigNumber(startVersion).plus(1).toString())
                .to
                .equal(new BigNumber(endVersion).toString(), 'DexPair code version incorrect');
        });
    });
});
