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
    .option('-l, --left <left>', 'left root')
    .option('-r, --right <right>', 'right root')
    .option('-ocn, --old_contract_name <old_contract_name>', 'Old DexPair contract name')
    .option('-ncn, --new_contract_name <new_contract_name>', 'New DexPair contract name')
    .option('-pt, --pool_type <pool_type>', 'Pool type');

program.parse(process.argv);

const options = program.opts();

options.left = options.left || 'foo';
options.right = options.right || 'bar';
options.old_contract_name = options.old_contract_name || 'DexPairPrev';
options.new_contract_name = options.new_contract_name || 'DexPair';
options.pool_type = options.pool_type || '1';

const tokenLeft = Constants.tokens[options.left];
const tokenRight = Constants.tokens[options.right];

let NewVersionContract;

let account;
let tokenFoo;
let tokenBar;
let dexRoot;
let dexPairFooBar;

let targetVersion;

let oldPairData = {};
let newPairData = {};

const loadPairData = async (pair, contractName) => {
  const data = {};

  data.root = await pair.call({method: 'getRoot'});
  data.vault = await pair.call({method: 'getVault'});

  data.current_version = (await pair.call({method: 'getVersion'})).toString();
  data.platform_code = await pair.call({method: 'platform_code'});

  const token_roots = await pair.call({method: 'getTokenRoots'});
  data.lp_root = token_roots.lp;
  console.log(token_roots);
  if (contractName === 'DexStablePool') {
    data.left_root = token_roots.roots[0];
    data.right_root = token_roots.roots[1];
  } else {
    data.left_root = token_roots.left;
    data.right_root = token_roots.right;
  }

  data.active = await pair.call({method: 'isActive'});

  const token_wallets = await pair.call({method: 'getTokenWallets'});
  data.lp_wallet = token_wallets.lp;
  if (contractName === 'DexStablePool') {
    data.left_wallet = token_wallets.token_wallets[0];
    data.right_wallet = token_wallets.token_wallets[1];
  } else {
    data.left_wallet = token_wallets.left;
    data.right_wallet = token_wallets.right;
  }

  const vault_token_wallets = await pair.call({method: 'getVaultWallets'});
  if (contractName === 'DexStablePool') {
    data.vault_left_wallet = vault_token_wallets.token_vault_wallets[0];
    data.vault_right_wallet = vault_token_wallets.token_vault_wallets[1];
  } else {
    data.vault_left_wallet = vault_token_wallets.left;
    data.vault_right_wallet = vault_token_wallets.right;
  }

  const balances = await pair.call({method: 'getBalances'});
  data.lp_supply = balances.lp_supply.toString();
  if (contractName=== 'DexStablePool') {
    data.left_balance = balances.balances[0].toString();
    data.right_balance = balances.balances[1].toString();
  } else {
    data.left_balance = balances.left_balance.toString();
    data.right_balance = balances.right_balance.toString();
  }

  const fee_params = await pair.call({method: 'getFeeParams'});
  data.fee_pool = fee_params.pool_numerator.div(fee_params.denominator).times(100).toString();
  data.fee_beneficiary = fee_params.beneficiary_numerator.div(fee_params.denominator).times(100).toString();
  data.fee_beneficiary_address = fee_params.beneficiary;
  data.threshold = fee_params.threshold;
  if (contractName === 'DexPair' || contractName === 'DexStablePair') {
    data.fee_referrer = fee_params.referrer_numerator.div(fee_params.denominator).times(100).toString();
  }
  data.pool_type = (await pair.call({method: 'getPoolType'})).toNumber();

  return data;
}

console.log(``);
console.log(`##############################################################################################`);
console.log(`35-upgrade-pair.js`);
console.log(`OPTIONS: `, options);

describe('Test Dex Pair contract upgrade', async function () {
  this.timeout(Constants.TESTS_TIMEOUT);

  before('Load contracts', async function () {
    account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;
    dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
    if (migration.exists('DexPair' + tokenLeft.symbol + tokenRight.symbol)) {
      dexPairFooBar = migration.load(await locklift.factory.getContract(options.old_contract_name), 'DexPair' + tokenLeft.symbol + tokenRight.symbol);
    } else {
      dexPairFooBar = migration.load(await locklift.factory.getContract(options.old_contract_name), 'DexPool' + tokenLeft.symbol + tokenRight.symbol);
    }

    NewVersionContract = await locklift.factory.getContract(options.new_contract_name);

    targetVersion = new BigNumber(await dexRoot.call({method: 'getPairVersion', params: {pool_type: options.pool_type}})).toNumber();

    tokenFoo = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), tokenLeft.symbol + 'Root');
    tokenBar = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), tokenRight.symbol + 'Root');

    const [keyPair] = await locklift.keys.getKeyPairs();

    oldPairData = await loadPairData(dexPairFooBar, options.old_contract_name);
    logger.log(`Old Pair(${dexPairFooBar.address}) data:\n${JSON.stringify(oldPairData, null, 4)}`);
    logger.log(`Upgrading DexPair contract: 
        - left=${tokenFoo.address}
        - right=${tokenBar.address}
        - current version = ${oldPairData.current_version}
        - current pool_type = ${oldPairData.pool_type}
        - target version = ${targetVersion}
        - target pool_type = ${options.pool_type}`);

    const tx = await account.runTarget({
      contract: dexRoot,
      method: 'upgradePair',
      params: {
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
        send_gas_to: account.address,
        pool_type: options.pool_type
      },
      value: locklift.utils.convertCrystal(6, 'nano'),
      keyPair
    });

    console.log(`##########################`);
    displayTx(tx);
    console.log(`##########################`);

    NewVersionContract.setAddress(dexPairFooBar.address);
    newPairData = await loadPairData(NewVersionContract, options.new_contract_name);
    logger.log(`New Pair(${NewVersionContract.address}) data:\n${JSON.stringify(newPairData, null, 4)}`);
  })
  describe('Check DexPair after upgrade', async function () {
    if (options.new_contract_name === 'TestNewDexPair') {
      it('Check New Function', async function () {
        expect((await NewVersionContract.call({method: 'newFunc', params: {}})).toString())
            .to
            .equal("New Pair", 'DexPair new function incorrect');
      });
      }
    it('Check All data correct installed in new contract', async function () {
      expect(newPairData.root)
        .to
        .equal(oldPairData.root, 'New root value incorrect');
      expect(newPairData.vault)
        .to
        .equal(oldPairData.vault, 'New vault value incorrect');
      expect(newPairData.platform_code)
        .to
        .equal(oldPairData.platform_code, 'New platform_code value incorrect');
      expect(newPairData.current_version.toString())
        .to
        .equal(targetVersion.toString(), 'New current_version value incorrect');
      expect(newPairData.pool_type.toString())
          .to
          .equal(options.pool_type, 'New current_version value incorrect');
      expect(newPairData.lp_root)
        .to
        .equal(oldPairData.lp_root, 'New lp_root value incorrect');
      expect(newPairData.left_root)
        .to
        .equal(oldPairData.left_root, 'New left_root value incorrect');
      expect(newPairData.right_root)
        .to
        .equal(oldPairData.right_root, 'New right_root value incorrect');
      expect(newPairData.active)
        .to
        .equal(oldPairData.active, 'New active value incorrect');
      expect(newPairData.lp_wallet)
        .to
        .equal(oldPairData.lp_wallet, 'New lp_wallet value incorrect');
      expect(newPairData.left_wallet)
        .to
        .equal(oldPairData.left_wallet, 'New left_wallet value incorrect');
      expect(newPairData.right_wallet)
        .to
        .equal(oldPairData.right_wallet, 'New right_wallet value incorrect');
      expect(newPairData.vault_left_wallet)
        .to
        .equal(oldPairData.vault_left_wallet, 'New vault_left_wallet value incorrect');
      expect(newPairData.vault_right_wallet)
        .to
        .equal(oldPairData.vault_right_wallet, 'New vault_right_wallet value incorrect');
      expect(newPairData.lp_supply)
        .to
        .equal(oldPairData.lp_supply, 'New lp_supply value incorrect');
      expect(newPairData.left_balance)
        .to
        .equal(oldPairData.left_balance, 'New left_balance value incorrect');
      expect(newPairData.right_balance)
        .to
        .equal(oldPairData.right_balance, 'New right_balance value incorrect');

      expect(newPairData.fee_pool)
          .to
          .equal(oldPairData.fee_pool, 'New fee_pool value incorrect');

      expect(newPairData.fee_beneficiary)
          .to
          .equal(oldPairData.fee_beneficiary, 'New fee_beneficiary value incorrect');

      expect(newPairData.fee_beneficiary_address)
          .to
          .equal(oldPairData.fee_beneficiary_address, 'New fee beneficiary value incorrect');

      if (options.new_contract_name === 'DexPair' || options.new_contract_name === 'DexStablePair') {
        expect(newPairData.fee_referrer)
            .to
            .not
            .equal(undefined, 'New fee referrer value incorrect');
      }
    });
  });
});
