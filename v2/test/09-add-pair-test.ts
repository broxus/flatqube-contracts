import { expect } from 'chai';
import { Command } from 'commander';
import { Address, Contract, toNano, zeroAddress } from 'locklift';
import { Account } from 'everscale-standalone-client/nodejs';

import { Migration, Constants, displayTx } from '../utils/migration';
import { DexAccountAbi, DexPairAbi } from '../../build/factorySource';

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option('-l, --left <left>', 'left root')
  .option('-r, --right <right>', 'right root')
  .option('-a, --account <account>', 'dex account number')
  .option(
    '-ig, --ignore_already_added <ignore_already_added>',
    'ignore already added check',
  )
  .option('-cn, --contract_name <contract_name>', 'DexPair contract name')
  .option(
    '-acn, --account_contract_name <account_contract_name>',
    'DexAccount contract name',
  );

program.parse(process.argv);

const options = program.opts();

options.left = options.left || 'foo';
options.right = options.right || 'bar';
options.account = options.account || 2;
options.ignore_already_added = options.ignore_already_added === 'true';
options.contract_name = options.contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

const tokenLeft =
  options.left.slice(-2) === 'Lp'
    ? {
        name: options.left,
        symbol: options.left,
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      }
    : Constants.tokens[options.left];
const tokenRight =
  options.right.slice(-2) === 'Lp'
    ? {
        name: options.right,
        symbol: options.right,
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      }
    : Constants.tokens[options.right];

describe('Check DexAccount add Pair', () => {
  let dexPair: Contract<DexPairAbi>;
  let dexAccount: Contract<DexAccountAbi>;
  let account: Account;
  let left_root: Address;
  let right_root: Address;
  let lp_root: Address;

  before('Load contracts', async () => {
    account = await migration.loadAccount(
      'Account' + options.account,
      options.account.toString(),
    );

    locklift.tracing.setAllowedCodes({ compute: [100] });

    dexAccount = migration.loadContract(
      'DexAccount',
      'DexAccount' + options.account,
    );
    dexPair = migration.loadContract(
      options.contract_name,
      'DexPool' + tokenLeft.symbol + tokenRight.symbol,
    );

    const dexPairFooBarRoots = await dexPair.methods
      .getTokenRoots({ answerId: 0 })
      .call();

    left_root = dexPairFooBarRoots.left;
    right_root = dexPairFooBarRoots.right;
    lp_root = dexPairFooBarRoots.lp;
  });

  if (!options.ignore_already_added) {
    describe('Check pair not added already', () => {
      it('Check DexAccount pair wallets', async () => {
        const leftRootWallet = await dexAccount.methods
          .getWalletData({ answerId: 0, token_root: left_root })
          .call()
          .then((r) => r.wallet);

        const rightRootWallet = await dexAccount.methods
          .getWalletData({ answerId: 0, token_root: right_root })
          .call()
          .then((r) => r.wallet);

        const lpRootWallet = await dexAccount.methods
          .getWalletData({ answerId: 0, token_root: lp_root })
          .call()
          .then((r) => r.wallet);

        expect(leftRootWallet).to.equal(
          zeroAddress,
          'DexAccount wallet address for LeftRoot is not empty',
        );
        expect(rightRootWallet).to.equal(
          zeroAddress,
          'DexAccount wallet address for RightRoot is not empty',
        );
        expect(lpRootWallet).to.equal(
          zeroAddress,
          'DexAccount wallet address for LPRoot is not empty',
        );
      });
    });
  }

  describe('Add new DexPair to DexAccount', () => {
    before('Adding new pair', async () => {
      const tx = await locklift.transactions.waitFinalized(
        dexAccount.methods
          .addPair({ left_root, right_root })
          .send({ from: account.address, amount: toNano(3.1) }),
      );

      displayTx(tx);
    });

    it('Check FooBar pair in DexAccount2', async () => {
      const leftRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: left_root })
        .call()
        .then((r) => r.wallet);

      const rightRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: right_root })
        .call()
        .then((r) => r.wallet);

      const lpRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: lp_root })
        .call()
        .then((r) => r.wallet);

      expect(leftRootWallet).to.not.equal(
        zeroAddress,
        'DexAccount wallet address for LeftRoot is empty',
      );
      expect(rightRootWallet).to.not.equal(
        zeroAddress,
        'DexAccount wallet address for RightRoot is empty',
      );
      expect(lpRootWallet).to.not.equal(
        zeroAddress,
        'DexAccount wallet address for LPRoot is empty',
      );
    });
  });
});
