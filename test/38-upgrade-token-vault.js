const {expect} = require('chai');
const logger = require('mocha-logger');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const {Migration, afterRun, Constants} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-t, --token <token>', 'DexTokenVault Token')
    .option('-ocn, --old_contract_name <old_contract_name>', 'Old DexTokenVault contract name')
    .option('-ncn, --new_contract_name <new_contract_name>', 'New DexTokenVault contract name');

program.parse(process.argv);

const options = program.opts();

options.token = options.token || 'foo';
options.old_contract_name = options.old_contract_name || 'DexTokenVault';
options.new_contract_name = options.new_contract_name || 'DexTokenVault';

let NewDexTokenVault;
let rootOwner;
let dexTokenVault;
let dexRoot;
let tokenRoot;
let targetVersion;

let oldTokenVaultData = {};
let newTokenVaultData = {};

const loadTokenVaultData = async (token_vault) => {
    const data = {};

    data.root = await token_vault.call({method: 'getDexRoot'});
    data.current_version = (await token_vault.call({method: 'getVersion'})).toString();
    data.platform_code = await token_vault.call({method: 'getPlatformCode'});
    data.token_root = await token_vault.call({method: 'getTokenRoot'});
    data.token_wallet = await token_vault.call({method: 'getTokenWallet'});
    data.legacy_vault = await token_vault.call({method: 'getLegacyVault'});
    data.target_balance = (await token_vault.call({method: 'getTargetBalance'})).toString();

    return data;
}

describe('Test DexTokenVault contract upgrade', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {
        rootOwner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
        tokenRoot = migration.load(await locklift.factory.getContract('TokenRootUpgradeable'), Constants.tokens[options.token].symbol + 'Root');
        let dexTokenVaultAddress = await dexRoot.call({method: 'getExpectedTokenVaultAddress', params: {_tokenRoot: tokenRoot.address}});
        dexTokenVault = await locklift.factory.getContract(options.old_contract_name);
        dexTokenVault.setAddress(dexTokenVaultAddress);
        rootOwner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        rootOwner.afterRun = afterRun;
        NewDexTokenVault = await locklift.factory.getContract(options.new_contract_name);

        targetVersion = await dexRoot.call({method: 'getTokenVaultVersion', params: {}});

        const [keyPair] = await locklift.keys.getKeyPairs();

        oldTokenVaultData = await loadTokenVaultData(dexTokenVault);
        logger.log(`Old TokenVault(${dexTokenVault.address}) data:\n${JSON.stringify(oldTokenVaultData, null, 4)}`);

        logger.log(`Requesting upgrade for DexTokenVault contract: ${dexTokenVault.address}`);
        await rootOwner.runTarget({
            contract: dexRoot,
            method: 'upgradeTokenVault',
            params: {_tokenRoot: tokenRoot.address, _remainingGasTo: rootOwner.address},
            value: locklift.utils.convertCrystal(6, 'nano'),
            keyPair: keyPair
        });
        NewDexTokenVault.setAddress(dexTokenVault.address);
        newTokenVaultData = await loadTokenVaultData(NewDexTokenVault);
        logger.log(`New TokenVault(${NewDexTokenVault.address}) data:\n${JSON.stringify(newTokenVaultData, null, 4)}`);
    })
    describe('Check DexTokenVault after upgrade', async function () {
        // it('Check New Function', async function () {
        //   expect((await NewDexTokenVault.call({method: 'newFunc', params: {}})).toString())
        //       .to
        //       .equal("New TokenVault", 'DexTokenVault new function incorrect');
        // });
        it('Check All data correct installed in new contract', async function () {
            expect(newTokenVaultData.root)
                .to
                .equal(oldTokenVaultData.root, 'New root value incorrect');
            expect(newTokenVaultData.platform_code)
                .to
                .equal(oldTokenVaultData.platform_code, 'New platform_code value incorrect');
            expect(newTokenVaultData.current_version)
                .to
                .equal(targetVersion.toString(), 'New current_version value incorrect');
            expect(newTokenVaultData.token_root)
                .to
                .equal(oldTokenVaultData.token_root, 'New token_root value incorrect');
            expect(newTokenVaultData.token_wallet)
                .to
                .equal(oldTokenVaultData.token_wallet, 'New token_wallet value incorrect');
            expect(newTokenVaultData.legacy_vault)
                .to
                .equal(oldTokenVaultData.legacy_vault, 'New legacy_vault value incorrect');
            expect(newTokenVaultData.target_balance)
                .to
                .equal(oldTokenVaultData.target_balance, 'New target_balance value incorrect');
        });
    });
});
