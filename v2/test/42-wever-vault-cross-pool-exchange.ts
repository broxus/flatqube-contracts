import { Command } from "commander";
import { Contract, fromNano, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";
import logger from "mocha-logger-ts";

import { Constants, Migration } from "../../utils/oldUtils/migration";
import {
  DexPairAbi,
  DexRootAbi,
  TokenRootUpgradeableAbi,
  VaultTokenRoot_V1Abi,
} from "../../build/factorySource";

const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option("-a, --amount <amount>", "Amount of first token for exchange", "100")
  .option("-st, --start-token <startToken>", "Spent token", "foo")
  .option("-r, --route <route>", "Exchange route", "[]")
  .option("-tn, --to-native <toNative>", "", "false");

program.parse(process.argv);

const options = program.opts();

type Route = {
  outcoming: string;
  roots: string[];
};

const amount: string = options.amount;
const startToken: string = options.startToken.toLowerCase();
const route: Route[] = JSON.parse(options.route);
const toNative: boolean = options.toNative === "true";
const finishToken: string = route[route.length - 1].outcoming.toLowerCase();

logger.log("------------------------- OPTIONS -------------------------");
logger.log(`Amount: ${amount}`);
logger.log(`Start token: ${startToken}`);
logger.log(`Route: ${JSON.stringify(route)}`);
logger.log(`To native: ${toNative}`);
logger.log("-----------------------------------------------------------");

describe("Check WEVER cross-pair swaps", () => {
  let dexRoot: Contract<DexRootAbi>;
  let weverVault: Contract<VaultTokenRoot_V1Abi>;
  let firstPair: Contract<DexPairAbi>;
  let account3: Account;

  const tokens: Record<string, Contract<TokenRootUpgradeableAbi>> = {};
  const pairs: Record<string, Contract<DexPairAbi>> = {};
  const pairToTokens: Record<string, string[]> = {};

  const getPairByTokens = (tokens: string[]): Contract<DexPairAbi> => {
    const symbols = tokens.map(t => Constants.tokens[t].symbol);

    if (migration.exists(`DexPool${symbols.join("")}`)) {
      return migration.loadContract("DexPair", `DexPool${symbols.join("")}`);
    }

    return migration.loadContract(
      "DexPair",
      `DexPool${symbols.reverse().join("")}`,
    );
  };

  const loadTokensFromRoutes = (routes: Route[]): void => {
    const uniqueTokens = new Set<string>();

    routes.forEach(r =>
      r.roots.forEach(root => uniqueTokens.add(Constants.tokens[root].symbol)),
    );

    uniqueTokens.forEach(token => {
      tokens[token.toLowerCase()] = migration.loadContract(
        "TokenRootUpgradeable",
        `${token}Root`,
      );
    });
  };

  const loadPairsFromRoutes = (routes: Route[]): void => {
    routes.forEach(r => {
      pairs[r.roots.join("")] = getPairByTokens(r.roots);
      pairToTokens[r.roots.join("")] = r.roots.map(root => root.toLowerCase());
    });
  };

  const logContractsAddresses = (): void => {
    logger.success(
      "------------------- CONTRACTS ADDRESSES -------------------",
    );
    logger.log(`WeverVault: ${weverVault.address}`);
    logger.log(`DexRoot: ${dexRoot.address}`);
    logger.log(`Account#3: ${account3.address}`);
    logger.log(`First pair: ${firstPair.address}`);

    logger.log("");
    logger.log("Tokens:");

    Object.keys(tokens).forEach(k => logger.log(`${k}: ${tokens[k].address}`));

    logger.log("");
    logger.log("Pairs:");

    Object.keys(pairs).forEach(k => logger.log(`${k}: ${pairs[k].address}`));

    logger.log("-----------------------------------------------------------");
  };

  const getPairsReserves = async (): Promise<
    Record<string, Record<string, string>>
  > => {
    logger.success(
      "---------------------- PAIRS RESERVES ---------------------",
    );

    const balances: Record<string, Record<string, string>> = {};

    for (const pair of Object.keys(pairs)) {
      const roots = await pairs[pair].methods
        .getTokenRoots({ answerId: 0 })
        .call();

      const reserves = await pairs[pair].methods
        .getBalances({ answerId: 0 })
        .call()
        .then(r => r.value0);

      const symbols = roots.left.equals(tokens[pairToTokens[pair][0]].address)
        ? { left: pairToTokens[pair][0], right: pairToTokens[pair][1] }
        : { left: pairToTokens[pair][1], right: pairToTokens[pair][0] };

      balances[pair] = {
        [symbols.left]: reserves.left_balance,
        [symbols.right]: reserves.right_balance,
        lp: reserves.lp_supply,
      };

      logger.log(
        `${pair} reserves: ${symbols.left} - ${new BigNumber(
          reserves.left_balance,
        ).shiftedBy(-Constants.tokens[symbols.left].decimals)}, ${
          symbols.right
        } - ${new BigNumber(reserves.right_balance).shiftedBy(
          -Constants.tokens[symbols.right].decimals,
        )}, LP - ${new BigNumber(reserves.lp_supply).shiftedBy(
          -Constants.LP_DECIMALS,
        )}`,
      );
    }

    logger.log("-----------------------------------------------------------");

    return balances;
  };

  const getAccountBalances = async (): Promise<Record<string, string>> => {
    logger.success(
      "--------------------- ACCOUNT RESERVES --------------------",
    );

    const balances: Record<string, string> = {};
    balances["ever"] = await locklift.provider.getBalance(account3.address);

    logger.log(`ever: ${fromNano(balances["ever"])}`);

    for (const token of Object.keys(tokens)) {
      const wallet = await tokens[token].methods
        .walletOf({ answerId: 0, walletOwner: account3.address })
        .call()
        .then(r =>
          locklift.factory.getDeployedContract(
            "TokenWalletUpgradeable",
            r.value0,
          ),
        );

      const isDeployed = await wallet
        .getFullState()
        .then(s => !!s.state?.isDeployed);

      if (isDeployed) {
        const balance = await wallet.methods
          .balance({ answerId: 0 })
          .call()
          .then(r => r.value0);

        balances[token] = balance;

        logger.log(
          `${token}: ${new BigNumber(balance).shiftedBy(
            -Constants.tokens[token].decimals,
          )}`,
        );
      } else {
        balances[token] = "0";
      }
    }

    logger.log("-----------------------------------------------------------");

    return balances;
  };

  before("Load contracts", async () => {
    weverVault = migration.loadContract("VaultTokenRoot_V1", "WEVERRoot");
    dexRoot = migration.loadContract("DexRoot", "DexRoot");
    account3 = await migration.loadAccount("Account3", "3");
    firstPair = getPairByTokens(route[0].roots);

    loadTokensFromRoutes(route);
    loadPairsFromRoutes(route);
    logContractsAddresses();
  });

  describe(`cross-pair swap ${startToken} on ${finishToken}`, () => {
    it(`should swap ${startToken} on ${finishToken}`, async () => {
      const pairsBalancesBefore = await getPairsReserves();
      const accountBalancesBefore = await getAccountBalances();

      const pairsChain: string[] = route.map(r => r.roots.join(""));

      logger.log(`Swaps chain: ${pairsChain.join(" -> ")}`);

      const expectedAmounts: string[] = [];
      let incomingToken = startToken.toLowerCase();
      let incomingAmount = new BigNumber(amount)
        .shiftedBy(Constants.tokens[incomingToken].decimals)
        .toString();

      for (const r of route) {
        const expectedExchange = await pairs[r.roots.join("")].methods
          .expectedExchange({
            answerId: 0,
            amount: incomingAmount,
            spent_token_root: tokens[incomingToken].address,
          })
          .call();

        logger.log(
          `Expected swap in ${r.roots.join("")} pair: ${new BigNumber(
            incomingAmount,
          ).shiftedBy(
            -Constants.tokens[incomingToken].decimals,
          )} ${incomingToken} -> ${new BigNumber(
            expectedExchange.expected_amount,
          ).shiftedBy(
            -Constants.tokens[r.outcoming.toLowerCase()].decimals,
          )} ${r.outcoming.toLowerCase()}, Fee: ${new BigNumber(
            expectedExchange.expected_fee,
          ).shiftedBy(
            -Constants.tokens[incomingToken].decimals,
          )} ${incomingToken}`,
        );

        incomingToken = r.outcoming.toLowerCase();
        incomingAmount = expectedExchange.expected_amount;
        expectedAmounts.push(expectedExchange.expected_amount);
      }

      const payload = await firstPair.methods
        .buildCrossPairExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedAmounts[0],
          _outcoming: tokens[route[0].outcoming].address,
          _nextStepIndices: [0],
          _steps: route
            .map((r, i) => ({
              amount: expectedAmounts[i],
              outcoming: tokens[r.outcoming].address,
              roots: r.roots.map(root => tokens[root].address),
              nextStepIndices: i === route.length - 1 ? [] : [i],
              numerator: 1,
            }))
            .slice(1),
          _recipient: account3.address,
          _referrer: zeroAddress,
          _successPayload: "",
          _cancelPayload: "",
          _toNative: toNative,
        })
        .call()
        .then(r => r.value0);

      logger.success(`Swap payload: ${payload}`);

      const wallet = await tokens[startToken].methods
        .walletOf({ answerId: 0, walletOwner: account3.address })
        .call()
        .then(r =>
          locklift.factory.getDeployedContract(
            "TokenWalletUpgradeable",
            r.value0,
          ),
        );

      let extraWrap = "0";

      if (
        startToken === "wever" &&
        +toNano(amount) > +accountBalancesBefore[startToken]
      ) {
        extraWrap = new BigNumber(toNano(amount))
          .minus(accountBalancesBefore[startToken])
          .toString();
      }

      await locklift.tracing.trace(
        wallet.methods
          .transfer({
            amount: new BigNumber(amount)
              .shiftedBy(Constants.tokens[startToken].decimals)
              .toString(),
            recipient: firstPair.address,
            deployWalletValue: 0,
            remainingGasTo: account3.address,
            notify: true,
            payload: payload,
          })
          .send({
            from: account3.address,
            amount: new BigNumber(extraWrap)
              .plus(toNano(pairsChain.length * 2))
              .toString(),
          }),
      );

      const pairsBalancesAfter = await getPairsReserves();
      const accountBalancesAfter = await getAccountBalances();

      for (const pair of pairsChain) {
        for (const token of pairToTokens[pair]) {
          const delta = new BigNumber(pairsBalancesAfter[pair][token])
            .minus(pairsBalancesBefore[pair][token])
            .toString();

          logger.success(`${pair} ${token} delta: ${delta}`);
        }
      }

      if (startToken === "wever") {
        const startTokenDelta = new BigNumber(accountBalancesAfter[startToken])
          .plus(accountBalancesAfter["ever"])
          .minus(accountBalancesBefore[startToken])
          .minus(accountBalancesBefore["ever"])
          .toString();

        expect(+startTokenDelta).to.be.below(
          -toNano(amount),
          `Wrong account ${startToken} after cross-pair swap`,
        );
      } else {
        const startTokenDelta = new BigNumber(accountBalancesAfter[startToken])
          .minus(accountBalancesBefore[startToken])
          .toString();

        expect(startTokenDelta).to.be.equal(
          new BigNumber(-amount)
            .shiftedBy(Constants.tokens[startToken].decimals)
            .toString(),
          `Wrong account ${startToken} after cross-pair swap`,
        );
      }

      if (toNative) {
        const finishTokenDelta = new BigNumber(accountBalancesAfter["ever"])
          .minus(accountBalancesBefore["ever"])
          .toString();

        expect(+finishTokenDelta).to.be.closeTo(
          +expectedAmounts[expectedAmounts.length - 1],
          +toNano(1),
          `Wrong account ever after cross-pair swap`,
        );
      } else {
        const finishTokenDelta = new BigNumber(
          accountBalancesAfter[finishToken],
        )
          .minus(accountBalancesBefore[finishToken])
          .toString();

        expect(finishTokenDelta).to.be.equal(
          expectedAmounts[expectedAmounts.length - 1],
          `Wrong account ${finishToken} after cross-pair swap`,
        );
      }
    });
  });
});
