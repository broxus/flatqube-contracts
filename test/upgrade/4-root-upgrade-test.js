const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, afterRun, Constants} = require(process.cwd() + '/scripts/utils')

const migration = new Migration();

let DexRoot;
let DexVault;
let DexPlatform;
let DexAccount;
let DexPair;
let NewDexRoot;

let account;
let dexRoot;
let dexVault;

let oldRootData = {};
let newRootData = {};

const loadRootData = async (root) => {
  const data = {};
  data.platform_code = await root.call({method: 'platform_code'});
  data.account_code = await root.call({method: 'getAccountCode'});
  data.account_version = (await root.call({method: 'getAccountVersion'})).toString();
  data.token_vault_code = await root.call({method: 'getTokenVaultCode'});
  data.token_vault_version = (await root.call({method: 'getTokenVaultVersion'})).toString();
  data.lp_token_pending_code = await root.call({method: 'getLpTokenPendingCode'});
  data.lp_token_pending_version = (await root.call({method: 'getLpTokenPendingVersion'})).toString();
  data.pair_code = await root.call({method: 'getPairCode', params: { pool_type: 1}});
  data.pair_version = (await root.call({method: 'getPairVersion', params: { pool_type: 1}})).toString();
  data.pool_code = await root.call({method: 'getPoolCode', params: { pool_type: 3}});
  data.pool_version = (await root.call({method: 'getPoolVersion', params: { pool_type: 3}})).toString();
  data.active = await root.call({method: 'isActive'});
  data.owner = await root.call({method: 'getOwner'});
  data.vault = await root.call({method: 'getVault'});
  data.pending_owner = await root.call({method: 'getPendingOwner'});
  data.token_factory = await root.call({method: 'getTokenFactory'});
  return data;
}

describe('Test Dex Root contract upgrade', async function () {
  this.timeout(Constants.TESTS_TIMEOUT);
  before('Load contracts', async function () {
    account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;
    DexRoot = await locklift.factory.getContract('DexRoot');
    DexVault = await locklift.factory.getContract('DexVault');
    DexPlatform = await locklift.factory.getContract('DexPlatform', 'precompiled');
    DexAccount = await locklift.factory.getContract('DexAccount');
    DexPair = await locklift.factory.getContract('DexPair');

    dexRoot = migration.load(DexRoot, 'DexRoot');
    dexVault = migration.load(DexVault, 'DexVault');

    NewDexRoot = await locklift.factory.getContract('TestNewDexRoot');

    const [keyPair] = await locklift.keys.getKeyPairs();

    oldRootData = await loadRootData(dexRoot);

    logger.log(`Upgrading DexRoot contract: ${dexRoot.address}`);
    await account.runTarget({
      contract: dexRoot,
      method: 'upgrade',
      params: {
        code: NewDexRoot.code
      },
      value: locklift.utils.convertCrystal(11, 'nano'),
      keyPair
    });
    NewDexRoot.setAddress(dexRoot.address);
    newRootData = await loadRootData(NewDexRoot);
  })
  describe('Check DexRoot after upgrade', async function () {
    it('Check New Function', async function () {
      expect((await NewDexRoot.call({method: 'newFunc', params: {}})).toString())
        .to
        .equal("New Root", 'DexRoot new function incorrect');
    });
    it('Check All data correct installed in new contract', async function () {
      expect(newRootData.platform_code)
        .to
        .equal(oldRootData.platform_code, 'New platform_code value incorrect');
      expect(newRootData.account_code)
        .to
        .equal(oldRootData.account_code, 'New account_code value incorrect');
      expect(newRootData.account_version)
        .to
        .equal(oldRootData.account_version, 'New account_version value incorrect');
      expect(newRootData.token_vault_code)
          .to
          .equal(oldRootData.token_vault_code, 'New token_vault_code value incorrect');
      expect(newRootData.token_vault_version)
          .to
          .equal(oldRootData.token_vault_version, 'New token_vault_version value incorrect');
      expect(newRootData.lp_token_pending_code)
          .to
          .equal(oldRootData.lp_token_pending_code, 'New lp_token_pending_code value incorrect');
      expect(newRootData.lp_token_pending_version)
          .to
          .equal(oldRootData.lp_token_pending_version, 'New lp_token_pending_version value incorrect');
      expect(newRootData.pair_code)
        .to
        .equal(oldRootData.pair_code, 'New pair_code value incorrect');
      expect(newRootData.pair_version)
        .to
        .equal(oldRootData.pair_version, 'New pair_version value incorrect');
      expect(newRootData.pool_code)
          .to
          .equal(oldRootData.pool_code, 'New pool_code value incorrect');
      expect(newRootData.pool_version)
          .to
          .equal(oldRootData.pool_version, 'New pool_version value incorrect');
      expect(newRootData.active)
        .to
        .equal(oldRootData.active, 'New active value incorrect');
      expect(newRootData.owner)
        .to
        .equal(oldRootData.owner, 'New owner value incorrect');
      expect(newRootData.vault)
        .to
        .equal(oldRootData.vault, 'New vault value incorrect');
      expect(newRootData.pending_owner)
        .to
        .equal(oldRootData.pending_owner, 'New pending_owner value incorrect');
      expect(newRootData.token_factory)
          .to
          .equal(oldRootData.token_factory, 'New token_factory value incorrect');
    });
  });
});
