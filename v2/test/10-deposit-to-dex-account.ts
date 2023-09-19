import { expect } from 'chai';
import { BigNumber } from 'bignumber.js';
import { Command } from 'commander';
import { Account } from 'everscale-standalone-client/nodejs';
import { toNano, Contract } from 'locklift';
import logger from 'mocha-logger-ts';

import { Migration, EMPTY_TVM_CELL, Constants } from '../utils/migration';
import {
  DexAccountAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from '../../build/factorySource';

BigNumber.config({ EXPONENTIAL_AT: 257 });

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option('-o, --owner_n <owner_n>', 'owner number')
  .option('-d, --deposits <deposits>', 'deposits data');

program.parse(process.argv);

const options = program.opts();

options.owner_n = options.owner_n ? +options.owner_n : 2;

type Balances = {
  dexAccountVirtualBalance: string;
  dexAccountWalletBalance: string;
  accountWalletBalance: string;
  vaultWalletBalance: string;
};

type Deposit = {
  tokenId: string;
  amount: number;
  tokenRoot: Contract<TokenRootUpgradeableAbi>;
  vaultWallet: Contract<TokenWalletUpgradeableAbi>;
  accountWallet: Contract<TokenWalletUpgradeableAbi>;
  dexAccountWallet: Contract<TokenWalletUpgradeableAbi>;
  history: Balances[];
} & Balances;

const deposits: Deposit[] = options.deposits
  ? JSON.parse(options.deposits)
  : [
      { tokenId: 'foo', amount: 10000 },
      { tokenId: 'bar', amount: 10000 },
      { tokenId: 'tst', amount: 10000 },
    ];

describe('Check Deposit to Dex Account', () => {
  let dexAccountN: Contract<DexAccountAbi>;
  let accountN: Account;

  const loadWallets = async (data: Deposit) => {
    const tokenData =
      data.tokenId.slice(-2) === 'Lp'
        ? {
            name: data.tokenId,
            symbol: data.tokenId,
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[data.tokenId];

    data.tokenRoot = migration.loadContract(
      'TokenRootUpgradeable',
      tokenData.symbol + 'Root',
    );
    data.vaultWallet = migration.loadContract(
      'TokenWalletUpgradeable',
      tokenData.symbol + 'VaultWallet',
    );
    data.vaultWalletBalance = new BigNumber(
      await data.vaultWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then((r) => r.value0),
    )
      .shiftedBy(-tokenData.decimals)
      .toString();
    data.accountWallet = migration.loadContract(
      'TokenWalletUpgradeable',
      tokenData.symbol + 'Wallet' + options.owner_n,
    );
    data.accountWalletBalance = new BigNumber(
      await data.accountWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then((r) => r.value0),
    )
      .shiftedBy(-tokenData.decimals)
      .toString();

    const accountNWalletData = await dexAccountN.methods
      .getWalletData({ answerId: 0, token_root: data.tokenRoot.address })
      .call();

    data.dexAccountWallet = locklift.factory.getDeployedContract(
      'TokenWalletUpgradeable',
      accountNWalletData.wallet,
    );
    data.dexAccountVirtualBalance = new BigNumber(accountNWalletData.balance)
      .shiftedBy(-tokenData.decimals)
      .toString();
    data.dexAccountWalletBalance = new BigNumber(
      await data.dexAccountWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then((r) => r.value0),
    )
      .shiftedBy(-tokenData.decimals)
      .toString();
  };

  const displayBalancesChanges = async (data: Deposit) => {
    const oldBalances: Balances = {
      vaultWalletBalance: data.vaultWalletBalance,
      accountWalletBalance: data.accountWalletBalance,
      dexAccountVirtualBalance: data.dexAccountVirtualBalance,
      dexAccountWalletBalance: data.dexAccountWalletBalance,
    };

    await loadWallets(data);

    for (const [key, value] of Object.entries(oldBalances)) {
      const change = data[key as never] - +value;
      logger.log(`${key}: ${change >= 0 ? '+' : ''}${change}`);
    }

    data.history.push(oldBalances);
  };

  const displayBalances = (tokenName: string, data: any) => {
    logger.log('='.repeat(30) + `${tokenName.toUpperCase()}` + '='.repeat(30));
    logger.log(`Root: ${data.tokenRoot.address}`);
    logger.log(`${tokenName}VaultWallet(${data.vaultWallet.address}): 
        - balance=${data.vaultWalletBalance}`);
    logger.log(`${tokenName}Wallet${options.owner_n}(${data.accountWallet.address}): 
        - balance=${data.accountWalletBalance}`);
    logger.log(`DexAccount${options.owner_n}${tokenName}Wallet(${data.dexAccountWallet.address}): 
        - balance=${data.dexAccountWalletBalance}
        - virtual_balance=${data.dexAccountVirtualBalance}`);
  };

  before('Load contracts and balances', async () => {
    accountN = await migration.loadAccount(
      'Account' + options.owner_n,
      options.owner_n.toString(),
    );

    locklift.tracing.setAllowedCodes({ compute: [100] });

    dexAccountN = migration.loadContract(
      'DexAccount',
      'DexAccount' + options.owner_n,
    );

    for (const deposit of deposits) {
      deposit.history = [];

      await loadWallets(deposit);

      const tokenData =
        deposit.tokenId.slice(-2) === 'Lp'
          ? {
              name: deposit.tokenId,
              symbol: deposit.tokenId,
              decimals: Constants.LP_DECIMALS,
              upgradeable: true,
            }
          : Constants.tokens[deposit.tokenId];

      displayBalances(tokenData.symbol, deposit);
    }
  });

  for (const deposit of deposits) {
    const tokenData =
      deposit.tokenId.slice(-2) === 'Lp'
        ? {
            name: deposit.tokenId,
            symbol: deposit.tokenId,
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[deposit.tokenId];

    describe(`Check ${tokenData.symbol} make deposit to dex account`, () => {
      before(`Make ${tokenData.symbol} deposit`, async () => {
        logger.log('#################################################');
        logger.log(`# Make ${tokenData.symbol} deposit`);

        await locklift.transactions.waitFinalized(
          deposit.accountWallet.methods
            .transferToWallet({
              amount: new BigNumber(deposit.amount)
                .shiftedBy(tokenData.decimals)
                .toString(),
              recipientTokenWallet: deposit.dexAccountWallet.address,
              remainingGasTo: accountN.address,
              notify: true,
              payload: EMPTY_TVM_CELL,
            })
            .send({ from: accountN.address, amount: toNano(0.5) }),
        );

        logger.log(tokenData.symbol + ' balance changes:');

        await displayBalancesChanges(deposit);
      });

      it(`Check ${tokenData.symbol} Balances after deposit`, async () => {
        const lastDeposit = deposit.history[deposit.history.length - 1];

        expect(deposit.accountWalletBalance).to.equal(
          new BigNumber(lastDeposit.accountWalletBalance)
            .minus(deposit.amount)
            .toString(),
          `${tokenData.symbol}Wallet${options.owner_n} has wrong balance after deposit`,
        );
        expect(deposit.dexAccountWalletBalance).to.equal(
          lastDeposit.dexAccountWalletBalance,
          `DexAccount${options.owner_n}${tokenData.symbol}Wallet has wrong balance after deposit`,
        );
        expect(deposit.dexAccountVirtualBalance).to.equal(
          new BigNumber(lastDeposit.dexAccountVirtualBalance)
            .plus(deposit.amount)
            .toString(),
          `DexAccount${options.owner_n} ${tokenData.symbol} has wrong balance virtual after deposit`,
        );
        expect(deposit.dexAccountWalletBalance).to.equal(
          '0',
          'DexVault ${tokenData.symbol} wallet has wrong balance after deposit',
        );
      });
    });
  }
});
