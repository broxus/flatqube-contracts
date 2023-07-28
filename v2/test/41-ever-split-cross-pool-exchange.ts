import { expect } from 'chai';
import { BigNumber } from 'bignumber.js';
import { Command } from 'commander';
import { Address, Contract, fromNano, toNano, zeroAddress } from 'locklift';
import { Account } from 'everscale-standalone-client/nodejs';
import logger from 'mocha-logger-ts';

import { Migration, Constants, displayTx } from '../utils/migration';
import {
  DexPairAbi,
  DexRootAbi,
  DexStablePoolAbi,
  DexVaultAbi,
  EverToTip3Abi,
  EverWeverToTip3Abi,
  TestWeverVaultAbi,
  Tip3ToEverAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from '../../build/factorySource';

BigNumber.config({ EXPONENTIAL_AT: 257 });

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option('-a, --amount <amount>', 'Amount of first token for exchange')
  .option('-st, --start_token <start_token>', 'Spent token')
  .option('-r, --route <route>', 'Exchange route')
  .option('-m, --multi <multi>', '')
  .option(
    '-prcn, --pair_contract_name <pair_contract_name>',
    'DexPair contract name',
  )
  .option(
    '-plcn, --pool_contract_name <pool_contract_name>',
    'DexPool contract name',
  );

program.parse(process.argv);

const options = program.opts();

options.amount = options.amount ? +options.amount : 100;
options.start_token = options.start_token ? options.start_token : 'foo';
options.route = options.route ? JSON.parse(options.route) : [];
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.pool_contract_name = options.pool_contract_name || 'DexStablePool';
options.multi = options.multi === 'true';

console.log(options.route);

const tokens: Record<
  string,
  { name: string; symbol: string; decimals: number; upgradeable: boolean }
> = {};

function getPoolName(pool_tokens: string[]) {
  return pool_tokens.reduce((acc, token) => acc + tokens[token].symbol, '');
}

function isLpToken(token: string, pool_roots: string[]) {
  return token.slice(-2) === 'Lp' && !pool_roots.includes(token);
}

type Route = {
  amount: string;
  pool: Address;
  outcoming: Address;
  numerator: string;
  pool_roots?: string[];
  nextSteps: Route[];
  roots?: string[];
  nextStepIndices: number[];
};

function logBalances(
  header: string,
  dex: Record<string, string>,
  account: Record<string, string>,
  pools: Record<
    string,
    {
      symbols: string[];
      balances: string[];
      lp_supply: string;
      lp_symbol: string;
    }
  >,
) {
  const dexStr =
    `DEX balance ${header}: ` +
    Object.keys(dex)
      .map((r) => `${dex[r]} ${tokens[r].symbol}`)
      .join(', ');
  let accountStr =
    `Account#3 balance ${header}: ` +
    Object.keys(account)
      .filter((r) => r !== 'ever')
      .map(
        (r) =>
          `${account[r] || 0} ${tokens[r].symbol}` +
          (account[r] === undefined ? ' (not deployed)' : ''),
      )
      .join(', ');

  accountStr += ', ' + account.ever + ' EVER';

  logger.log(dexStr);
  logger.log(accountStr);
  Object.values(pools).forEach((p) => {
    const poolName = p.symbols.reduce((acc, token) => acc + token, '');

    let logs = `DexPool#${poolName}: `;
    p.balances.forEach(
      (balance, idx) => (logs += `${balance} ${p.symbols[idx]}, `),
    );
    logs += `${p.lp_supply} ${p.lp_symbol}`;
    logger.log(logs);
  });
}

describe('Check direct operations', () => {
  let DexRoot: Contract<DexRootAbi>;
  let DexVault: Contract<DexVaultAbi>;
  let EverToTip3: Contract<EverToTip3Abi>;
  let Tip3ToEver: Contract<Tip3ToEverAbi>;
  let WeverVault: Contract<TestWeverVaultAbi>;
  let EverWeverToTip3: Contract<EverWeverToTip3Abi>;
  let Account3: Account;
  const poolsContracts: Record<
    string,
    Contract<DexPairAbi & DexStablePoolAbi>
  > = {};
  const tokenRoots: Record<string, Contract<TokenRootUpgradeableAbi>> = {};
  const accountWallets: Record<
    string,
    Contract<TokenWalletUpgradeableAbi>
  > = {};
  const dexWallets: Record<string, Contract<TokenWalletUpgradeableAbi>> = {};

  const getPoolTokensRoots = async (
    poolName: string,
    pool_tokens: string[],
  ): Promise<Address[]> => {
    const Pool = poolsContracts[poolName];

    if (pool_tokens.length === 2) {
      // pairs
      return Pool.methods
        .getTokenRoots({ answerId: 0 })
        .call()
        .then((r: any) => [r.left, r.right, r.lp]);
    } else {
      // pools
      return Pool.methods
        .getTokenRoots({ answerId: 0 })
        .call()
        .then((r) => r.roots);
    }
  };

  const dexBalances = async () => {
    const balances: Record<string, string> = {};

    balances[options.start_token] = await dexWallets[
      options.start_token
    ].methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        return new BigNumber(n.value0)
          .shiftedBy(-tokens[options.start_token].decimals)
          .toString();
      });

    async function getBalance(route: Route[]) {
      for (const elem of route) {
        balances[elem.outcoming.toString()] = await dexWallets[
          elem.outcoming.toString()
        ].methods
          .balance({ answerId: 0 })
          .call()
          .then((n) => {
            return new BigNumber(n.value0)
              .shiftedBy(-tokens[elem.outcoming.toString()].decimals)
              .toString();
          });

        await getBalance(elem.nextSteps);
      }
    }

    await getBalance(options.route);

    return balances;
  };

  const account3balances = async () => {
    const balances: Record<string, string> = {};

    await accountWallets[options.start_token].methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        balances[options.start_token] = new BigNumber(n.value0)
          .shiftedBy(-tokens[options.start_token].decimals)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    async function getBalance(route: Route[]) {
      for (const elem of route) {
        await accountWallets[elem.outcoming.toString()].methods
          .balance({ answerId: 0 })
          .call()
          .then((n) => {
            balances[elem.outcoming.toString()] = new BigNumber(n.value0)
              .shiftedBy(-tokens[elem.outcoming.toString()].decimals)
              .toString();
          })
          .catch(() => {
            /*ignored*/
          });

        await getBalance(elem.nextSteps);
      }
    }

    await getBalance(options.route);

    balances['ever'] = fromNano(
      await locklift.provider.getBalance(Account3.address),
    );

    return balances;
  };

  const dexPoolInfo = async (pool_tokens: string[]) => {
    const poolName = getPoolName(pool_tokens);
    const Pool = poolsContracts[poolName];
    const poolRoots = await getPoolTokensRoots(poolName, pool_tokens);

    const balances = await Pool.methods
      .getBalances({ answerId: 0 })
      .call()
      .then((r) => r.value0 as any);

    const lp_supply = new BigNumber(balances.lp_supply)
      .shiftedBy(-tokens[poolName + 'Lp'].decimals)
      .toString();

    let token_symbols: string[], token_balances: string[];

    if (pool_tokens.length === 2) {
      // pairs

      token_symbols = [
        tokens[pool_tokens[0]].symbol,
        tokens[pool_tokens[1]].symbol,
      ];
      if (poolRoots[0] === tokenRoots[pool_tokens[0]].address) {
        token_balances = [
          new BigNumber(balances.left_balance)
            .shiftedBy(-tokens[pool_tokens[0]].decimals)
            .toString(),
          new BigNumber(balances.right_balance)
            .shiftedBy(-tokens[pool_tokens[1]].decimals)
            .toString(),
        ];
      } else {
        token_balances = [
          new BigNumber(balances.right_balance)
            .shiftedBy(-tokens[pool_tokens[0]].decimals)
            .toString(),
          new BigNumber(balances.left_balance)
            .shiftedBy(-tokens[pool_tokens[1]].decimals)
            .toString(),
        ];
      }
    } else {
      // pools
      token_symbols = [];
      token_balances = [];

      pool_tokens.forEach((token) => {
        const idx = poolRoots.findIndex(
          (token_root) => token_root === tokenRoots[token].address,
        );
        token_symbols.push(tokens[token].symbol);
        token_balances.push(
          new BigNumber(balances.balances[idx])
            .shiftedBy(-tokens[token].decimals)
            .toString(),
        );
      });
    }

    return {
      symbols: token_symbols,
      balances: token_balances,
      lp_symbol: poolName + 'Lp',
      lp_supply: lp_supply,
    };
  };

  before('Load contracts', async () => {
    EverToTip3 = migration.loadContract('EverToTip3', 'EverToTip3');
    Tip3ToEver = migration.loadContract('Tip3ToEver', 'Tip3ToEver');
    EverWeverToTip3 = migration.loadContract(
      'EverWeverToTip3',
      'EverWeverToTip3',
    );
    WeverVault = migration.loadContract('TestWeverVault', 'WEVERVault');

    logger.log(`EverToTip3: ${EverToTip3.address}`);
    logger.log(`Tip3ToEver: ${Tip3ToEver.address}`);
    logger.log(`EverWEverToTip3: ${EverWeverToTip3.address}`);

    DexRoot = migration.loadContract('DexRoot', 'DexRoot');
    DexVault = migration.loadContract('DexVault', 'DexVault');
    Account3 = await migration.loadAccount('Account3', '3');

    logger.log('DexRoot: ' + DexRoot.address);
    logger.log('DexVault: ' + DexVault.address);
    logger.log('Account#3: ' + Account3.address);

    async function loadPoolsData(route: Route[]) {
      for (const elem of route) {
        const pool_tokens = elem.roots;

        for (const token of pool_tokens) {
          if (token.slice(-2) === 'Lp') {
            tokens[token] = {
              name: token,
              symbol: token,
              decimals: Constants.LP_DECIMALS,
              upgradeable: true,
            };
          } else {
            tokens[token] = Constants.tokens[token];
          }

          if (tokenRoots[token] === undefined) {
            const root = migration.loadContract(
              'TokenRootUpgradeable',
              tokens[token].symbol + 'Root',
            );

            tokenRoots[token] = root;
            logger.log(`${tokens[token].symbol}TokenRoot: ${root.address}`);
          }
        }

        const poolName = getPoolName(pool_tokens);
        tokens[poolName + 'Lp'] = {
          name: poolName + 'Lp',
          symbol: poolName + 'Lp',
          decimals: Constants.LP_DECIMALS,
          upgradeable: true,
        };

        let pool;

        if (pool_tokens.length === 2) {
          const tokenLeft = tokens[pool_tokens[0]];
          const tokenRight = tokens[pool_tokens[1]];

          if (
            migration.exists(`DexPool${tokenLeft.symbol}${tokenRight.symbol}`)
          ) {
            pool = migration.loadContract(
              options.pair_contract_name,
              `DexPool${tokenLeft.symbol}${tokenRight.symbol}`,
            );

            logger.log(
              `DexPool${tokenLeft.symbol}${tokenRight.symbol}: ${pool.address}`,
            );
          } else if (
            migration.exists(`DexPool${tokenRight.symbol}${tokenLeft.symbol}`)
          ) {
            pool = migration.loadContract(
              options.pair_contract_name,
              `DexPool${tokenRight.symbol}${tokenLeft.symbol}`,
            );

            logger.log(
              `DexPool${tokenRight.symbol}${tokenLeft.symbol}: ${pool.address}`,
            );
          } else {
            logger.log(
              `DexPool${tokenLeft.symbol}${tokenRight.symbol} NOT EXISTS`,
            );
          }
        } else {
          if (migration.exists(`DexPool${poolName}`)) {
            pool = migration.loadContract(
              options.pool_contract_name,
              `DexPool${poolName}`,
            );

            logger.log(`DexPool${poolName}: ${pool.address}`);
          } else {
            logger.log(`DexPool${poolName} NOT EXISTS`);
          }
        }

        poolsContracts[poolName] = pool;

        await loadPoolsData(elem.nextSteps);
      }
    }

    await loadPoolsData(options.route);

    async function loadSingleTokenData(tokenId: string) {
      const tokenName =
        tokenId.slice(-2) === 'Lp' && Constants.tokens[tokenId] === undefined
          ? tokenId
          : Constants.tokens[tokenId].symbol;

      if (tokenRoots[tokenId] === undefined) {
        tokens[tokenId] = {
          name: tokenId,
          symbol: tokenName,
          decimals: Constants.LP_DECIMALS,
          upgradeable: true,
        };
        const root = migration.loadContract(
          'TokenRootUpgradeable',
          tokenName + 'Root',
        );
        tokenRoots[tokenId] = root;

        logger.log(`${tokenName}TokenRoot: ${root.address}`);
      }

      if (
        accountWallets[tokenId] === undefined ||
        dexWallets[tokenId] === undefined
      ) {
        let accountWallet: Contract<TokenWalletUpgradeableAbi>;

        if (migration.exists(tokenName + 'Wallet3')) {
          accountWallet = migration.loadContract(
            'TokenWalletUpgradeable',
            tokenName + 'Wallet3',
          );

          logger.log(`${tokenName}Wallet#3: ${accountWallet.address}`);
        } else {
          const expectedAccountWallet = await tokenRoots[tokenId].methods
            .walletOf({ answerId: 0, walletOwner: Account3.address })
            .call()
            .then((r) => r.value0);

          accountWallet = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            expectedAccountWallet,
          );

          logger.log(
            `${tokenName}Wallet#3: ${expectedAccountWallet} (not deployed)`,
          );
        }

        const dexWallet = migration.loadContract(
          'TokenWalletUpgradeable',
          tokenName + 'VaultWallet',
        );

        dexWallets[tokenId] = dexWallet;
        accountWallets[tokenId] = accountWallet;

        logger.log(`${tokenName}VaultWallet: ${dexWallet.address}`);
      }
    }

    async function getRouteTokensInfo(route: Route[]) {
      for (const elem of route) {
        await loadSingleTokenData(elem.outcoming.toString());

        await getRouteTokensInfo(elem.nextSteps);
      }
    }

    await loadSingleTokenData(options.start_token);
    await getRouteTokensInfo(options.route);
  });

  describe('Direct split-cross-pool exchange', () => {
    if (options.multi) {
      it('Account#3 cross-pair exchange', async () => {
        logger.log('#################################################');
        logger.log(`Wrap ${options.amount / 2} EVER`);

        await WeverVault.methods
          .wrap({
            tokens: new BigNumber(options.amount).div(2).toString(),
            owner_address: Account3.address,
            gas_back_address: Account3.address,
            payload: '',
          })
          .send({
            from: Account3.address,
            amount: new BigNumber(options.amount)
              .div(2)
              .plus(1)
              .shiftedBy(9)
              .dp(0)
              .toString(),
          });
      });
    }

    it('Account#3 split-cross-pool exchange', async () => {
      logger.log('#################################################');

      async function getRouteDexPoolsInfo(
        route: Route[],
        poolsMap: Record<
          string,
          {
            symbols: string[];
            balances: string[];
            lp_symbol: string;
            lp_supply: string;
          }
        >,
      ) {
        for (const elem of route) {
          const poolName = getPoolName(elem.roots);
          poolsMap[poolName] = await dexPoolInfo(elem.roots);

          await getRouteDexPoolsInfo(elem.nextSteps, poolsMap);
        }
      }

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const poolsStart: Record<string, any> = {};

      await getRouteDexPoolsInfo(options.route, poolsStart);

      logBalances('start', dexStart, accountStart, poolsStart);

      const expectedPoolBalances: Record<
        string,
        {
          lp_supply: string;
          balances: string[];
        }
      > = {};
      const steps: Route[] = [];
      const currentAmount = new BigNumber(options.amount)
        .shiftedBy(tokens[options.start_token].decimals)
        .toString();

      let finalExpectedAmount = new BigNumber(0);
      let lastTokenN: string;
      const lastStepPools: Route[] = [];

      // Calculate expected result
      logger.log(`### EXPECTED ###`);

      async function getExpectedAmount(
        route: Route[],
        spent_token: string,
        spent_amount: string,
      ) {
        const denominator = route.reduce(
          (partialSum, elem) => partialSum + +elem.numerator,
          0,
        );

        const next_indices = [];

        for (const elem of route) {
          const poolName = getPoolName(elem.roots);
          const poolRoots = await getPoolTokensRoots(poolName, elem.roots);

          const partial_spent_amount = new BigNumber(spent_amount)
            .multipliedBy(elem.numerator)
            .dividedToIntegerBy(denominator)
            .toString();

          let expected: any, expected_amount: string;

          if (isLpToken(spent_token, elem.roots)) {
            // spent token is lp token of the current pool
            const outcomingIndex = poolRoots.findIndex(
              (root) => root === tokenRoots[elem.outcoming.toString()].address,
            );

            expected = await poolsContracts[poolName].methods
              .expectedWithdrawLiquidityOneCoin({
                answerId: 0,
                lp_amount: partial_spent_amount,
                outcoming: tokenRoots[elem.outcoming.toString()].address,
              })
              .call()
              .then((r) => r.value0);

            expected_amount = expected.amounts[outcomingIndex];
          } else if (isLpToken(elem.outcoming.toString(), elem.roots)) {
            // receive token is lp token of the current pool
            const amounts = poolRoots.map((token_root) =>
              elem.roots.find(
                (token) => token_root === tokenRoots[token].address,
              ) === spent_token
                ? partial_spent_amount
                : '0',
            );

            expected = await poolsContracts[poolName].methods
              .expectedDepositLiquidityV2({ answerId: 0, amounts })
              .call()
              .then((r) => r.value0);

            expected_amount = expected['lp_reward'];
          } else {
            if (elem.roots.length === 2) {
              // pair
              expected = await (
                poolsContracts[poolName] as never as Contract<DexPairAbi>
              ).methods
                .expectedExchange({
                  answerId: 0,
                  amount: partial_spent_amount,
                  spent_token_root: tokenRoots[spent_token].address,
                })
                .call();
            } else {
              // pool
              expected = await poolsContracts[poolName].methods
                .expectedExchange({
                  answerId: 0,
                  amount: partial_spent_amount,
                  spent_token_root: tokenRoots[spent_token].address,
                  receive_token_root:
                    tokenRoots[elem.outcoming.toString()].address,
                })
                .call();
            }

            expected_amount = expected['expected_amount'];
          }

          console.log();

          const tokenLeft = tokens[spent_token];
          const tokenRight = tokens[elem.outcoming.toString()];

          let logStr = `${new BigNumber(partial_spent_amount).shiftedBy(
            -tokenLeft.decimals,
          )} ${tokenLeft.symbol}`;
          logStr += ' -> ';
          logStr += `${new BigNumber(expected_amount).shiftedBy(
            -tokenRight.decimals,
          )} ${tokenRight.symbol}`;

          if (isLpToken(spent_token, elem.roots)) {
            // spent token is lp token of the current pool
            logStr += `, fee = ${new BigNumber(
              expected['expected_fee'],
            ).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
          } else if (isLpToken(elem.outcoming.toString(), elem.roots)) {
            // receive token is lp token of the current pool
            const pool_tokens = poolRoots.map((token_root) =>
              elem.roots.find(
                (token) => token_root === tokenRoots[token].address,
              ),
            );

            (expected['pool_fees'] as string[]).forEach(
              (pool_fee, idx) =>
                (logStr += `, fee = ${new BigNumber(pool_fee)
                  .plus(expected['beneficiary_fees'][idx])
                  .shiftedBy(-tokens[pool_tokens[idx]].decimals)} ${
                  tokens[pool_tokens[idx]].symbol
                }`),
            );
          } else {
            logStr += `, fee = ${new BigNumber(
              expected['expected_fee'],
            ).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
          }
          logger.log(logStr);

          const expected_balances: string[] = [];

          elem.roots.forEach((root, idx) => {
            if (root === spent_token) {
              expected_balances.push(
                new BigNumber(partial_spent_amount)
                  .shiftedBy(-tokenLeft.decimals)
                  .plus(poolsStart[poolName].balances[idx])
                  .toString(),
              );
            } else if (root === elem.outcoming.toString()) {
              expected_balances.push(
                new BigNumber(poolsStart[poolName].balances[idx])
                  .minus(
                    new BigNumber(expected_amount).shiftedBy(
                      -tokenRight.decimals,
                    ),
                  )
                  .toString(),
              );
            } else {
              expected_balances.push(poolsStart[poolName].balances[idx]);
            }
          });

          let expected_lp_supply;

          if (isLpToken(spent_token, elem.roots)) {
            // spent token is lp token of the current pool
            expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply)
              .minus(
                new BigNumber(partial_spent_amount).shiftedBy(
                  -tokenLeft.decimals,
                ),
              )
              .toString();
          } else if (isLpToken(elem.outcoming.toString(), elem.roots)) {
            // receive token is lp token of the current pool
            expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply)
              .plus(
                new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals),
              )
              .toString();
          } else {
            expected_lp_supply = poolsStart[poolName].lp_supply;
          }

          expectedPoolBalances[poolName] = {
            lp_supply: expected_lp_supply,
            balances: expected_balances,
          };

          const next_step_indices = await getExpectedAmount(
            elem.nextSteps,
            elem.outcoming.toString(),
            expected_amount.toString(),
          );

          steps.push({
            amount: expected_amount.toString(),
            pool: poolsContracts[poolName].address,
            outcoming: tokenRoots[elem.outcoming.toString()].address,
            numerator: elem.numerator,
            nextStepIndices: next_step_indices,
          } as any);

          next_indices.push(steps.length - 1);

          if (!elem.nextSteps.length) {
            lastStepPools.push({
              roots: elem.roots,
              amount: expected_amount.toString(),
            } as any);
          }
        }

        if (!route.length) {
          finalExpectedAmount = finalExpectedAmount.plus(spent_amount);
          lastTokenN = spent_token;
        }

        return next_indices;
      }

      const next_indices = await getExpectedAmount(
        options.route,
        options.start_token,
        currentAmount,
      );

      logger.log('');

      const poolName = getPoolName(options.route[0].roots);
      const firstPool = poolsContracts[poolName];

      const params = {
        pool: firstPool.address,
        id: 0,
        deployWalletValue: toNano('0.1'),
        expectedAmount: steps[0].amount,
        steps: steps,
        outcoming: steps[next_indices[0]].outcoming,
        nextStepIndices: steps[next_indices[0]].nextStepIndices,
        referrer: zeroAddress,
      };

      logger.log(
        `Call buildCrossPairExchangePayload(${JSON.stringify(
          params,
          null,
          4,
        )})`,
      );

      const transferTo =
        options.start_token === 'wever'
          ? options.multi
            ? EverWeverToTip3
            : EverToTip3
          : Tip3ToEver;

      if (transferTo.address.equals(EverWeverToTip3.address)) {
        (params as any)['amount'] = new BigNumber(options.amount)
          .shiftedBy(Constants.tokens[options.start_token].decimals)
          .toString();
      }

      const payload = await (transferTo as Contract<EverToTip3Abi>).methods
        .buildCrossPairExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      if (options.start_token === 'wever') {
        if (options.multi) {
          const tx = await accountWallets[options.start_token].methods
            .transfer({
              amount: new BigNumber(options.amount)
                .div(2)
                .shiftedBy(Constants.tokens[options.start_token].decimals)
                .dp(0)
                .toString(),
              recipient: transferTo.address,
              deployWalletValue: 0,
              remainingGasTo: Account3.address,
              notify: true,
              payload: payload.value0,
            })
            .send({
              from: Account3.address,
              amount: new BigNumber(options.amount)
                .div(2)
                .plus(options.route.length * 0.5 + 5)
                .shiftedBy(Constants.tokens[options.start_token].decimals)
                .dp(0)
                .toString(),
            });

          displayTx(tx);
        } else {
          const tx = await WeverVault.methods
            .wrap({
              tokens: new BigNumber(options.amount).shiftedBy(9).toString(),
              owner_address: EverToTip3.address,
              gas_back_address: Account3.address,
              payload: payload.value0,
            })
            .send({
              from: Account3.address,
              amount: toNano(options.amount + 5 + options.route.length * 0.5),
            });

          displayTx(tx);
        }
      } else {
        const tx = await accountWallets[options.start_token].methods
          .transfer({
            amount: new BigNumber(options.amount)
              .shiftedBy(Constants.tokens[options.start_token].decimals)
              .toString(),
            recipient: transferTo.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: Account3.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            from: Account3.address,
            amount: toNano(options.route.length * 0.5 + 5),
          });

        displayTx(tx);
      }

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const poolsEnd: Record<
        string,
        {
          symbols: string[];
          balances: string[];
          lp_symbol: string;
          lp_supply: string;
        }
      > = {};

      await getRouteDexPoolsInfo(options.route, poolsEnd);

      logBalances('end', dexEnd, accountEnd, poolsEnd);

      console.log('lastTokenN', lastTokenN);

      if (options.start_token === 'wever') {
        const expectedAccountEver = new BigNumber(accountStart.wever || 0)
          .plus(accountStart.ever || 0)
          .minus(options.amount)
          .toNumber();
        expect(expectedAccountEver).to.approximately(
          new BigNumber(accountEnd.ever).plus(accountEnd.wever).toNumber(),
          1,
          `Account#3 wrong EVER balance`,
        );

        const expectedAccountLast = new BigNumber(finalExpectedAmount)
          .shiftedBy(-Constants.tokens[lastTokenN].decimals)
          .plus(accountStart[lastTokenN] || 0)
          .toString();
        expect(expectedAccountLast).to.equal(
          accountEnd[lastTokenN],
          `Account#3 wrong ${Constants.tokens[lastTokenN].symbol} balance`,
        );
      } else {
        const expectedAccountFirst = new BigNumber(
          accountStart[options.start_token] || 0,
        )
          .minus(options.amount)
          .toString();
        expect(expectedAccountFirst).to.equal(
          accountEnd[options.start_token],
          `Account#3 wrong ${
            Constants.tokens[options.start_token].symbol
          } balance`,
        );

        const expectedAccountEver = new BigNumber(accountStart.wever || 0)
          .plus(accountStart.ever || 0)
          .plus(new BigNumber(steps[0].amount).shiftedBy(-9))
          .toNumber();
        expect(expectedAccountEver).to.approximately(
          new BigNumber(accountEnd.ever).plus(accountEnd.wever).toNumber(),
          1,
          `Account#3 wrong EVER balance`,
        );
      }

      let expectedDexLast: BigNumber, expectedDexFirst: string;

      if (isLpToken(options.start_token, options.route[0].roots)) {
        // burn lp token (not transfer to vault)
        expectedDexFirst = new BigNumber(
          dexStart[options.start_token],
        ).toString();
      } else {
        expectedDexFirst = new BigNumber(dexStart[options.start_token] || 0)
          .plus(options.amount)
          .toString();
      }

      expectedDexLast = new BigNumber(dexStart[lastTokenN]);
      // mint lp token (not transfer from vault)
      lastStepPools
        .filter((lastPool) => !isLpToken(lastTokenN, lastPool.roots))
        .forEach((lastPool) => {
          expectedDexLast = expectedDexLast.minus(
            new BigNumber(lastPool.amount).shiftedBy(
              -tokens[lastTokenN].decimals,
            ),
          );
        });

      expect(expectedDexFirst).to.equal(
        dexEnd[options.start_token],
        `DexVault wrong ${tokens[options.start_token].symbol} balance`,
      );
      expect(expectedDexLast.toString()).to.equal(
        dexEnd[lastTokenN],
        `DexVault wrong ${tokens[lastTokenN].symbol} balance`,
      );

      // TODO: destroy and burn this
      Object.entries(poolsEnd)
        .filter((poolName) => expectedPoolBalances[poolName as never as string])
        .forEach((poolName, pool) => {
          expectedPoolBalances[poolName as never as string].balances.forEach(
            (expected_balance, idx) =>
              expect(
                new BigNumber((pool as any).balances[idx]).toString(),
              ).to.equal(
                expected_balance,
                `DexPair${poolName} wrong ${
                  (pool as any).symbols[idx]
                } balance`,
              ),
          );
          expect(new BigNumber((pool as any).lp_supply).toString()).to.equal(
            expectedPoolBalances[poolName as never as string].lp_supply,
            `DexPair${poolName} wrong ${(pool as any).lp_symbol} balance`,
          );
        });
    });
  });
});
