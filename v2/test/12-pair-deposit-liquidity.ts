import { expect } from 'chai';
import { Command } from 'commander';
import { BigNumber } from 'bignumber.js';
import logger from 'mocha-logger-ts';
import { getRandomNonce, Contract, toNano } from 'locklift';
import { Account } from 'everscale-standalone-client/nodejs';

import { Migration, Constants, displayTx } from '../utils/migration';
import {
  DexAccountAbi,
  DexPairAbi,
  DexRootAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from '../../build/factorySource';
import { expectedDepositLiquidity } from '../utils/math.utils';

BigNumber.config({ EXPONENTIAL_AT: 257 });

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option('-lr, --left_token_id <left_token_id>', 'left token id')
  .option('-rr, --right_token_id <right_token_id>', 'right token id')
  .option('-la, --left_amount <left_amount>', 'left amount')
  .option('-ra, --right_amount <right_amount>', 'right amount')
  .option('-ac, --auto_change <auto_change>', 'auto change')
  .option('-cn, --contract_name <contract_name>', 'DexPair contract name')
  .option(
    '-acn, --account_contract_name <account_contract_name>',
    'DexAccount contract name',
  );

program.parse(process.argv);

const options = program.opts();

options.left_token_id = options.left_token_id || 'foo';
options.right_token_id = options.right_token_id || 'bar';
options.left_amount = options.left_amount || '1';
options.right_amount = options.right_amount || '2';
options.auto_change = options.auto_change === 'true';
options.contract_name = options.contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

const left_token =
  options.left_token_id.slice(-2) === 'Lp'
    ? {
        name: options.left_token_id,
        symbol: options.left_token_id,
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      }
    : Constants.tokens[options.left_token_id];

const right_token =
  options.right_token_id.slice(-2) === 'Lp'
    ? {
        name: options.right_token_id,
        symbol: options.right_token_id,
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      }
    : Constants.tokens[options.right_token_id];

describe('DexAccount interact with DexPair', () => {
  let DexRoot: Contract<DexRootAbi>;
  let DexPairFooBar: Contract<DexPairAbi>;
  let FooRoot: Contract<TokenRootUpgradeableAbi>;
  let BarRoot: Contract<TokenRootUpgradeableAbi>;
  let FooBarLpRoot: Contract<TokenRootUpgradeableAbi>;
  let Account2: Account;
  let DexAccount2: Contract<DexAccountAbi>;
  let FooBarLpWallet2: Contract<TokenWalletUpgradeableAbi>;
  let BarWallet2: Contract<TokenWalletUpgradeableAbi>;
  let FooWallet2: Contract<TokenWalletUpgradeableAbi>;

  let IS_FOO_LEFT: boolean;

  const dexAccountBalances = async (account: Contract<DexAccountAbi>) => {
    const foo = new BigNumber(
      await account.methods
        .getWalletData({ answerId: 0, token_root: FooRoot.address })
        .call()
        .then((r) => r.balance),
    )
      .shiftedBy(-left_token.decimals)
      .toString();

    const bar = new BigNumber(
      await account.methods
        .getWalletData({ answerId: 0, token_root: BarRoot.address })
        .call()
        .then((r) => r.balance),
    )
      .shiftedBy(-right_token.decimals)
      .toString();

    const lp = new BigNumber(
      await account.methods
        .getWalletData({ answerId: 0, token_root: FooBarLpRoot.address })
        .call()
        .then((r) => r.balance),
    )
      .shiftedBy(-Constants.LP_DECIMALS)
      .toString();

    let walletFoo = '0';

    await FooWallet2.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        walletFoo = new BigNumber(n.value0)
          .shiftedBy(-left_token.decimals)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    let walletBar = '0';

    await BarWallet2.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        walletBar = new BigNumber(n.value0)
          .shiftedBy(-right_token.decimals)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    let walletLp = '0';

    await FooBarLpWallet2.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        walletLp = new BigNumber(n.value0)
          .shiftedBy(-Constants.LP_DECIMALS)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    return { foo, bar, lp, walletFoo, walletBar, walletLp };
  };

  const dexPairInfo = async () => {
    const balances = await DexPairFooBar.methods
      .getBalances({ answerId: 0 })
      .call()
      .then((r) => r.value0);
    const total_supply = await FooBarLpRoot.methods
      .totalSupply({ answerId: 0 })
      .call()
      .then((r) => r.value0);

    let foo, bar;

    if (IS_FOO_LEFT) {
      foo = new BigNumber(balances.left_balance)
        .shiftedBy(-left_token.decimals)
        .toString();
      bar = new BigNumber(balances.right_balance)
        .shiftedBy(-right_token.decimals)
        .toString();
    } else {
      foo = new BigNumber(balances.right_balance)
        .shiftedBy(-left_token.decimals)
        .toString();
      bar = new BigNumber(balances.left_balance)
        .shiftedBy(-right_token.decimals)
        .toString();
    }

    return {
      foo: foo,
      bar: bar,
      lp_supply: new BigNumber(balances.lp_supply)
        .shiftedBy(-Constants.LP_DECIMALS)
        .toString(),
      lp_supply_actual: new BigNumber(total_supply)
        .shiftedBy(-Constants.LP_DECIMALS)
        .toString(),
    };
  };

  before('Load contracts', async () => {
    locklift.tracing.setAllowedCodes({ compute: [100] });

    const symbols = left_token.symbol + right_token.symbol;

    DexRoot = migration.loadContract('DexRoot', 'DexRoot');
    DexPairFooBar = migration.loadContract(
      options.contract_name,
      'DexPool' + symbols,
    );
    FooRoot = migration.loadContract(
      'TokenRootUpgradeable',
      left_token.symbol + 'Root',
    );
    BarRoot = migration.loadContract(
      'TokenRootUpgradeable',
      right_token.symbol + 'Root',
    );
    FooBarLpRoot = migration.loadContract(
      'TokenRootUpgradeable',
      symbols + 'LpRoot',
    );
    Account2 = await migration.loadAccount('Account2', '2');
    DexAccount2 = migration.loadContract(
      options.account_contract_name,
      'DexAccount2',
    );

    if (
      migration.exists(`${left_token.symbol}${right_token.symbol}LpWallet2`)
    ) {
      FooBarLpWallet2 = migration.loadContract(
        'TokenWalletUpgradeable',
        `${symbols}LpWallet2`,
      );

      logger.log(`${symbols}LpWallet#2: ${FooBarLpWallet2.address}`);
    } else {
      const expected = await FooBarLpRoot.methods
        .walletOf({ answerId: 0, walletOwner: Account2.address })
        .call()
        .then((r) => r.value0);

      FooBarLpWallet2 = locklift.factory.getDeployedContract(
        'TokenWalletUpgradeable',
        expected,
      );

      migration.store(FooBarLpWallet2, `${symbols}LpWallet2`);
      logger.log(`${symbols}LpWallet#2: ${expected} (not deployed)`);
    }

    if (migration.exists(`${right_token.symbol}Wallet2`)) {
      BarWallet2 = migration.loadContract(
        'TokenWalletUpgradeable',
        `${right_token.symbol}Wallet2`,
      );

      logger.log(`${right_token.symbol}Wallet#2: ${BarWallet2.address}`);
    } else {
      const expected = await BarRoot.methods
        .walletOf({ answerId: 0, walletOwner: Account2.address })
        .call();

      BarWallet2 = locklift.factory.getDeployedContract(
        'TokenWalletUpgradeable',
        expected.value0,
      );

      migration.store(BarWallet2, `${right_token.symbol}Wallet2`);
      logger.log(`${right_token.symbol}Wallet#2: ${expected} (not deployed)`);
    }

    if (migration.exists(`${left_token.symbol}Wallet2`)) {
      FooWallet2 = migration.loadContract(
        'TokenWalletUpgradeable',
        `${left_token.symbol}Wallet2`,
      );

      logger.log(`${left_token.symbol}Wallet#2: ${FooWallet2.address}`);
    } else {
      const expected = await FooRoot.methods
        .walletOf({ answerId: 0, walletOwner: Account2.address })
        .call();

      FooWallet2 = locklift.factory.getDeployedContract(
        'TokenWalletUpgradeable',
        expected.value0,
      );

      migration.store(FooWallet2, `${left_token.symbol}Wallet2`);
      logger.log(`${left_token.symbol}Wallet#2: ${expected} (not deployed)`);
    }

    const pairRoots = await DexPairFooBar.methods
      .getTokenRoots({ answerId: 0 })
      .call();

    IS_FOO_LEFT = pairRoots.left.equals(FooRoot.address);

    logger.log('DexRoot: ' + DexRoot.address);
    logger.log(`DexPool${symbols}: ` + DexPairFooBar.address);
    logger.log(`${left_token.symbol}Root: ` + FooRoot.address);
    logger.log(`${right_token.symbol}Root: ` + BarRoot.address);
    logger.log(`${symbols}LpRoot: ` + FooBarLpRoot.address);
    logger.log('Account#2: ' + Account2.address);
    logger.log('DexAccount#2: ' + DexAccount2.address);
  });

  describe('Deposit', () => {
    it(`Deposit liquidity to ${left_token.symbol}/${right_token.symbol} (auto_change=${options.auto_change})`, async () => {
      logger.log('#################################################');
      logger.log(
        `# Add liquidity to ${left_token.symbol}/${right_token.symbol}`,
      );

      const dexAccount2Start = await dexAccountBalances(DexAccount2);
      const dexPairInfoStart = await dexPairInfo();

      logger.log(
        `DexAccount#2 balance start: ` +
          `${dexAccount2Start.foo} ${left_token.symbol}, ${dexAccount2Start.bar} ${right_token.symbol}, ${dexAccount2Start.lp} LP, ${dexAccount2Start.walletLp} LP (wallet)`,
      );
      logger.log(
        `DexPair start: ` +
          `${dexPairInfoStart.foo} ${left_token.symbol}, ${dexPairInfoStart.bar} ${right_token.symbol}, ` +
          `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply || '0'} LP, ` +
          `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual || '0'} LP`,
      );

      const LEFT_AMOUNT = IS_FOO_LEFT
        ? new BigNumber(options.left_amount)
            .shiftedBy(left_token.decimals)
            .toString()
        : new BigNumber(options.right_amount)
            .shiftedBy(right_token.decimals)
            .toString();

      const RIGHT_AMOUNT = IS_FOO_LEFT
        ? new BigNumber(options.right_amount)
            .shiftedBy(right_token.decimals)
            .toString()
        : new BigNumber(options.left_amount)
            .shiftedBy(left_token.decimals)
            .toString();

      const LP_REWARD = await expectedDepositLiquidity(
        DexPairFooBar.address,
        options.contract_name,
        IS_FOO_LEFT ? [left_token, right_token] : [right_token, left_token],
        [LEFT_AMOUNT, RIGHT_AMOUNT],
        options.auto_change,
      );

      const tx = await DexAccount2.methods
        .depositLiquidity({
          call_id: getRandomNonce(),
          left_root: IS_FOO_LEFT ? FooRoot.address : BarRoot.address,
          left_amount: LEFT_AMOUNT,
          right_root: IS_FOO_LEFT ? BarRoot.address : FooRoot.address,
          right_amount: RIGHT_AMOUNT,
          expected_lp_root: FooBarLpRoot.address,
          auto_change: options.auto_change,
          send_gas_to: Account2.address,
        })
        .send({ from: Account2.address, amount: toNano(1.1) });

      displayTx(tx);

      const dexAccount2End = await dexAccountBalances(DexAccount2);
      const dexPairInfoEnd = await dexPairInfo();

      logger.log(
        `DexAccount#2 balance end: ` +
          `${dexAccount2End.foo} ${left_token.symbol}, ${dexAccount2End.bar} ${right_token.symbol}, ${dexAccount2End.lp} LP, ${dexAccount2End.walletLp} LP (wallet)`,
      );
      logger.log(
        `DexPair end: ` +
          `${dexPairInfoEnd.foo} ${left_token.symbol}, ${dexPairInfoEnd.bar} ${right_token.symbol}, ` +
          `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply || '0'} LP, ` +
          `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual || '0'} LP`,
      );

      const expectedAccount2Foo = new BigNumber(dexAccount2Start.foo)
        .minus(options.left_amount)
        .toString();
      const expectedAccount2Bar = new BigNumber(dexAccount2Start.bar)
        .minus(options.right_amount)
        .toString();

      const expectedDexAccount2Lp = new BigNumber(
        dexAccount2Start.lp,
      ).toString();
      const expectedAccount2Lp = new BigNumber(dexAccount2Start.walletLp)
        .plus(LP_REWARD)
        .toString();

      const expectedPairFoo = new BigNumber(dexPairInfoStart.foo)
        .plus(options.left_amount)
        .toString();
      const expectedPairBar = new BigNumber(dexPairInfoStart.bar)
        .plus(options.right_amount)
        .toString();
      const expectedPairLp = new BigNumber(dexPairInfoStart.lp_supply)
        .plus(LP_REWARD)
        .toString();

      expect(dexPairInfoEnd.lp_supply_actual).to.equal(
        dexPairInfoEnd.lp_supply,
        'Wrong LP supply',
      );
      expect(expectedAccount2Foo).to.equal(
        dexAccount2End.foo,
        'Wrong DexAccount#2 FOO',
      );
      expect(expectedAccount2Bar).to.equal(
        dexAccount2End.bar,
        'Wrong DexAccount#2 BAR',
      );
      expect(expectedDexAccount2Lp).to.equal(
        dexAccount2End.lp,
        'Wrong DexAccount#2 LP',
      );
      expect(expectedAccount2Lp).to.equal(
        dexAccount2End.walletLp,
        'Wrong Account#2 LP',
      );
      expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo, 'Wrong DexPair FOO');
      expect(expectedPairBar).to.equal(dexPairInfoEnd.bar, 'Wrong DexPair BAR');
      expect(expectedPairLp).to.equal(
        dexPairInfoEnd.lp_supply,
        'Wrong DexPair LP supply',
      );
    });
  });
});
