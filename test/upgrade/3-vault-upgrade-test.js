const {expect} = require('chai');
const logger = require('mocha-logger');
const {Migration, afterRun, Constants, calcValue} = require(process.cwd() + '/scripts/utils')
const BigNumber = require("bignumber.js");

const migration = new Migration();

let DexRoot;
let DexVault;
let DexPlatform;
let TokenFactory;
let DexVaultLpTokenPending;
let NewDexVault;

let account;
let dexRoot;
let dexVault;
let tokenFactory;

let oldVaultData = {};
let newVaultData = {};

const loadVaultData = async (vault) => {
  const data = {};
  data.platform_code = await vault.call({method: 'platform_code', params: {}});
  data.root = await vault.call({method: 'getRoot', params: {}});
  data.owner = await vault.call({method: 'getOwner', params: {}});
  data.pending_owner = await vault.call({method: 'getPendingOwner', params: {}});
  data.manager = await vault.call({method: 'getManager', params: {}});
  const referralProgramParams = await vault.call({method: 'getReferralProgramParams', params: {}});
  data.projectId = referralProgramParams.projectId.toString();
  data.projectAddress = referralProgramParams.projectAddress;
  data.refSystemAddress = referralProgramParams.systemAddress;
  return data;
}

describe('Test Dex Vault contract upgrade', async function () {
  this.timeout(Constants.TESTS_TIMEOUT);
  before('Load contracts', async function () {
    console.log(`3-vault-upgrade-test.js`);
    account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;
    DexRoot = await locklift.factory.getContract('DexRoot');
    DexVault = await locklift.factory.getContract('DexVault');
    DexPlatform = await locklift.factory.getContract('DexPlatform', 'precompiled');
    TokenFactory = await locklift.factory.getContract('TokenFactory');

    DexVaultLpTokenPending = await locklift.factory.getContract('LpTokenPending');
    NewDexVault = await locklift.factory.getContract('TestNewDexVault');
    dexRoot = migration.load(DexRoot, 'DexRoot');
    dexVault = migration.load(DexVault, 'DexVault');
    tokenFactory = migration.load(TokenFactory, 'TokenFactory');

    const [keyPair] = await locklift.keys.getKeyPairs();
    oldVaultData = await loadVaultData(dexVault);

    const gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');
    const gas = await gasValues.call({
      method: 'getUpgradeVaultGas',
      params: {}
    });

    logger.log(`Upgrading DexVault contract: ${dexVault.address}`);
    await account.runTarget({
      contract: dexVault,
      method: 'upgrade',
      params: {
        code: NewDexVault.code
      },
      value: new BigNumber(0.1).shiftedBy(9).plus(calcValue(gas)).toString(),
      keyPair
    });
    NewDexVault.setAddress(dexVault.address);
    newVaultData = await loadVaultData(NewDexVault);
  })
  describe('Check DexVault after upgrade', async function () {
    it('Check New Function', async function () {
      expect((await NewDexVault.call({method: 'newFunc', params: {}})).toString())
        .to
        .equal("New Vault", 'DexVault new function incorrect');
    });
    it('Check All data correct installed in new contract', async function () {
      expect(newVaultData.platform_code)
        .to
        .equal(oldVaultData.platform_code, 'New platform_code value incorrect');
      expect(newVaultData.root)
        .to
        .equal(oldVaultData.root, 'New root value incorrect');
      expect(newVaultData.owner)
        .to
        .equal(oldVaultData.owner, 'New owner value incorrect');
      expect(newVaultData.pending_owner)
        .to
        .equal(oldVaultData.pending_owner, 'New pending_owner value incorrect');
      expect(newVaultData.manager)
          .to
          .equal(oldVaultData.manager, 'New manager value incorrect');

      expect(newVaultData.projectId)
          .to
          .equal(oldVaultData.projectId, 'New projectId value incorrect');

      expect(newVaultData.projectAddress)
          .to
          .equal(oldVaultData.projectAddress, 'New projectAddress value incorrect');

      expect(newVaultData.refSystemAddress)
          .to
          .equal(oldVaultData.refSystemAddress, 'New refSystemAddress value incorrect');
    });
  });
});
