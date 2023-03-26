import { expect } from 'chai';
import { Migration } from '../utils/migration';
import { Command } from 'commander';
import { Contract } from 'locklift';
import {
  DexRootAbi,
  DexVaultAbi,
  TokenFactoryAbi,
} from '../../build/factorySource';

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option(
    '-pcn, --pair_contract_name <pair_contract_name>',
    'DexPair contract code',
    'DexPair',
  )
  .option(
    '-acn, --account_contract_name <account_contract_name>',
    'DexAccount contract code',
    'DexAccount',
  );

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';

describe('Check for correct deployment', () => {
  let dexRoot: Contract<DexRootAbi>;
  let dexVault: Contract<DexVaultAbi>;
  let tokenFactory: Contract<TokenFactoryAbi>;

  before('Load contracts', () => {
    dexRoot = migration.loadContract(
      'DexRoot',
      'DexRoot',
    ) as Contract<DexRootAbi>;
    dexVault = migration.loadContract(
      'DexVault',
      'DexVault',
    ) as Contract<DexVaultAbi>;
    tokenFactory = migration.loadContract(
      'TokenFactory',
      'TokenFactory',
    ) as Contract<TokenFactoryAbi>;
  });

  describe('Check DexRoot', () => {
    it('Check DexRoot deployed', async () => {
      const isDeployed = await dexRoot
        .getFullState()
        .then((s) => s.state.isDeployed);

      return expect(isDeployed).to.be.true;
    });

    it('Check Platform code is installed', async () => {
      const DexPlatform = locklift.factory.getContractArtifacts('DexPlatform');

      const platformCode = await dexRoot.methods
        .platform_code()
        .call()
        .then((c) => c.platform_code);

      return expect(platformCode).to.equal(
        DexPlatform.code,
        'Wrong platform code in DexRoot',
      );
    });

    it('Check Account code is installed', async () => {
      const DexAccount = locklift.factory.getContractArtifacts('DexAccount');

      const accountCode = await dexRoot.methods
        .getAccountCode({ answerId: 0 })
        .call()
        .then((c) => c.value0);

      return expect(accountCode).to.equal(
        DexAccount.code,
        'Wrong Account code in DexRoot',
      );
    });

    it('Check Pair code is installed', async () => {
      const DexPair = locklift.factory.getContractArtifacts('DexPair');

      const pairCode = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call()
        .then((c) => c.value0);

      return expect(pairCode).to.equal(
        DexPair.code,
        'Wrong Pair code in DexRoot',
      );
    });

    it('Check Vault address', async () => {
      const vault = await dexRoot.methods
        .getVault({ answerId: 0 })
        .call()
        .then((v) => v.value0.toString());

      expect(vault).to.equal(
        dexVault.address.toString(),
        'Wrong DexVault address in DexRoot',
      );
    });

    it('Check TokenFactory address', async () => {
      const factory = await dexRoot.methods
        .getTokenFactory({ answerId: 0 })
        .call()
        .then((v) => v.value0.toString());

      expect(factory).to.equal(
        tokenFactory.address.toString(),
        'Wrong DexVault address in DexRoot',
      );
    });

    it('Check is Dex Active', async () => {
      const isActive = await dexRoot.methods
        .isActive({ answerId: 0 })
        .call()
        .then((a) => a.value0);

      expect(isActive).to.be.true;
    });

    it('Check TokenVault code is installed', async () => {
      const DexTokenVault =
        locklift.factory.getContractArtifacts('DexTokenVault');

      const vaultCode = await dexRoot.methods
        .getTokenVaultCode({ answerId: 0 })
        .call()
        .then((c) => c.value0);

      return expect(vaultCode).to.equal(
        DexTokenVault.code,
        'Wrong TokenVault code in DexRoot',
      );
    });

    it('Check LpTokenPending code is installed', async () => {
      const LpTokenPending = locklift.factory.getContractArtifacts(
        'LpTokenPending',
      );

      const lpTokenPendingCode = await dexRoot.methods
        .getLpTokenPendingCode({ answerId: 0 })
        .call()
        .then((c) => c.value0);

      return expect(lpTokenPendingCode).to.equal(
        LpTokenPending.code,
        'Wrong TokenVault code in DexRoot',
      );
    });
  });

  describe('Check DexVault', () => {
    it('Check DexVault deployed', async () => {
      const isDeployed = await dexVault
        .getFullState()
        .then((s) => s.state.isDeployed);

      return expect(isDeployed).to.be.true;
    });

    it('Check Platform code is installed', async () => {
      const DexPlatform = locklift.factory.getContractArtifacts('DexPlatform');

      const platformCode = await dexVault.methods
        .platform_code()
        .call()
        .then((c) => c.platform_code);

      return expect(platformCode).to.equal(
        DexPlatform.code,
        'Wrong platform code in DexVault',
      );
    });

    it('Check Root address', async () => {
      const root = await dexVault.methods
        .getRoot({ answerId: 0 })
        .call()
        .then((r) => r.value0.toString());

      return expect(root).to.equal(
        dexRoot.address.toString(),
        'Wrong DexRoot address in DexVault',
      );
    });
  });
});
