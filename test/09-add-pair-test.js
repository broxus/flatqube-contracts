const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, afterRun, Constants, displayTx, calcValue} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();
const migration = new Migration();

program
    .allowUnknownOption()
    .option('-l, --left <left>', 'left root')
    .option('-r, --right <right>', 'right root')
    .option('-a, --account <account>', 'dex account number')
    .option('-ig, --ignore_already_added <ignore_already_added>', 'ignore already added check')
    .option('-cn, --contract_name <contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();

options.left = options.left || 'foo';
options.right = options.right || 'bar';
options.account = options.account || 2;
options.ignore_already_added = options.ignore_already_added === 'true';
options.contract_name = options.contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

const tokenLeft = options.left.slice(-2) === 'Lp' ? {name: options.left, symbol: options.left, decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[options.left];
const tokenRight = options.right.slice(-2) === 'Lp' ? {name: options.right, symbol: options.right, decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[options.right];

let DexAccount;

let dexPair;
let dexAccount;
let account;
let left_root;
let right_root;
let lp_root;
let keyPairs;

describe('Check DexAccount add Pair', async function () {
  this.timeout(Constants.TESTS_TIMEOUT);
  before('Load contracts', async function () {
    keyPairs = await locklift.keys.getKeyPairs();
    DexAccount = await locklift.factory.getContract(options.account_contract_name);
    account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account' + options.account);
    if (locklift.tracing) {
      locklift.tracing.allowCodes({compute: [100]});
    }
    account.afterRun = afterRun;
    dexAccount = migration.load(DexAccount, 'DexAccount' + options.account);
    dexPair = migration.load(await locklift.factory.getContract(options.contract_name), 'DexPool' + tokenLeft.symbol + tokenRight.symbol);
    let dexPairFooBarRoots = await dexPair.call({method: 'getTokenRoots'});
    left_root = dexPairFooBarRoots.left;
    right_root = dexPairFooBarRoots.right;
    lp_root = dexPairFooBarRoots.lp;
    await migration.balancesCheckpoint();
  })

  if (!options.ignore_already_added) {
    describe('Check pair not added already', async function () {
      it('Check DexAccount pair wallets', async function () {
        expect((await dexAccount.call({method: 'getWalletData', params: {token_root: left_root}})).wallet)
          .to
          .equal(locklift.ton.zero_address, 'DexAccount wallet address for LeftRoot is not empty');
        expect((await dexAccount.call({method: 'getWalletData', params: {token_root: right_root}})).wallet)
          .to
          .equal(locklift.ton.zero_address, 'DexAccount wallet address for RightRoot is not empty');
        expect((await dexAccount.call({method: 'getWalletData', params: {token_root: lp_root}})).wallet)
          .to
          .equal(locklift.ton.zero_address, 'DexAccount wallet address for LPRoot is not empty');
      });
    });
  }
  describe('Add new DexPair to DexAccount', async function () {
    before('Adding new pair', async function () {
      const gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');
      const gas = await gasValues.call({
        method: 'getAddPoolGas',
        params: {N: 2}
      });

      let tx = await account.runTarget({
        contract: dexAccount,
        method: 'addPair',
        params: {
          left_root,
          right_root
        },
        value: options.account_contract_name === 'DexAccountPrev' ? locklift.utils.convertCrystal(3.1, 'nano') : calcValue(gas),
        keyPair: keyPairs[options.account - 1]
      });
      displayTx(tx);
      await afterRun();
      await migration.logGas();
    });
    it('Check FooBar pair in DexAccount2', async function () {
      expect((await dexAccount.call({method: 'getWalletData', params: {token_root: left_root}})).wallet)
        .to
        .not.equal(locklift.ton.zero_address, 'DexAccount wallet address for LeftRoot is empty');
      expect((await dexAccount.call({method: 'getWalletData', params: {token_root: right_root}})).wallet)
        .to
        .not.equal(locklift.ton.zero_address, 'DexAccount wallet address for RightRoot is empty');
      expect((await dexAccount.call({method: 'getWalletData', params: {token_root: lp_root}})).wallet)
        .to
        .not.equal(locklift.ton.zero_address, 'DexAccount wallet address for LPRoot is empty');
    });
  });
});
