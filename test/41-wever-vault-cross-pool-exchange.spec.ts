import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";

import BigNumber from "bignumber.js";

BigNumber.config({ EXPONENTIAL_AT: 257 });
import { TOKENS_N, TOKENS_DECIMALS } from "../utils/consts";
import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexRootAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../build/factorySource";
import { Account } from "locklift/everscale-client";
import {
  depositLiquidity,
  getExpectedTokenVaultAddress,
  getWallet,
  getWeverWallet,
  transferWrapper,
} from "../utils/wrappers";
import {
  expectedDepositLiquidityOneCoin,
  expectedExchange,
  expectedWithdrawLiquidityOneCoin,
} from "../utils/expected.utils";
import { calcValue } from "../utils/gas.utils";
import { expect } from "chai";

type RouteStep = {
  outcoming: Address;
  pool: Contract<DexPairAbi> | Contract<DexStablePoolAbi>;
};

describe("Check wever vault cross-pool exchange", async function () {
  let owner: Account;
  let dexAccount: Contract<DexAccountAbi>;
  let dexRoot: Contract<DexRootAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let tokensData: Record<string, { decimals: number; symbol: string }> = {};
  let poolsData: Record<
    string,
    { roots: Address[]; lp: Address; poolType: number; symbol: string }
  > = {};

  function getTokenBySymbol(symbol: string) {
    return locklift.deployments.getContract<TokenRootUpgradeableAbi>(symbol);
  }

  function getPoolBySymbol(symbol: string) {
    return locklift.deployments.getContract<DexPairAbi>(symbol);
  }

  async function getCrossPoolExchangeData(
    startToken: Address,
    startAmount: string,
    route: RouteStep[],
    toNative: boolean = false,
  ) {
    const steps: any[] = [];
    let expectedAmount = startAmount;
    let spentToken = startToken;

    for (let [i, step] of route.entries()) {
      const receiveTokenRoot = step.outcoming;

      if (spentToken.equals(poolsData[step.pool.address.toString()].lp)) {
        const expected = await expectedWithdrawLiquidityOneCoin(
          step.pool as Contract<DexStablePoolAbi>,
          expectedAmount,
          receiveTokenRoot,
        );
        expectedAmount = expected.receivedAmount;
      } else if (
        step.outcoming.equals(poolsData[step.pool.address.toString()].lp)
      ) {
        const expected = await expectedDepositLiquidityOneCoin(
          step.pool as Contract<DexStablePoolAbi>,
          expectedAmount,
          spentToken,
        );
        expectedAmount = expected.lpReward;
      } else {
        const expected = await expectedExchange(
          step.pool,
          expectedAmount,
          spentToken,
          receiveTokenRoot,
        );
        expectedAmount = expected.receivedAmount;
      }
      spentToken = receiveTokenRoot;

      steps.push({
        amount: expectedAmount,
        roots: poolsData[step.pool.address.toString()].roots,
        outcoming: step.outcoming,
        numerator: 1,
        nextStepIndices: i < route.length - 1 ? [steps.length + 1] : [],
      });
    }

    let payload;
    if (poolsData[route[0].pool.address.toString()].poolType === 3) {
      payload = await (route[0].pool as Contract<DexStablePoolAbi>).methods
        .buildCrossPairExchangePayload({
          id: getRandomNonce(),
          deployWalletGrams: toNano(0.1),
          expectedAmount: steps[0].amount,
          outcoming: steps[0].outcoming,
          nextStepIndices: steps[0].nextStepIndices,
          steps: steps,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
          to_native: toNative,
        })
        .call()
        .then(a => a.value0);
    } else {
      payload = await (route[0].pool as Contract<DexPairAbi>).methods
        .buildCrossPairExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: steps[0].amount,
          _outcoming: steps[0].outcoming,
          _nextStepIndices: steps[0].nextStepIndices,
          _steps: steps,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: toNative,
        })
        .call()
        .then(a => a.value0);
    }

    const gas = await gasValues.methods
      .getPoolCrossExchangeGas({
        steps: steps.length,
        leaves: 1,
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
      })
      .call()
      .then(a => a.value0);

    return {
      gas,
      payload,
      received: {
        root: steps[steps.length - 1].outcoming,
        amount: steps[steps.length - 1].amount,
      },
    };
  }

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: [
        "dex-gas-values",
        "dex-accounts",
        "dex-pairs",
        "wever",
        "dex-pairs-wever",
      ],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;
    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    for (let i = 0; i < TOKENS_N; ++i) {
      for (let decimal of TOKENS_DECIMALS) {
        const token = getTokenBySymbol(`token-${decimal}-${i}`);
        tokensData[token.address.toString()] = {
          decimals: await token.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
          symbol: `token-${decimal}-${i}`,
        };
      }
    }
    tokensData[getTokenBySymbol(`DexStablePool_lp`).address.toString()] = {
      decimals: 9,
      symbol: `DexStablePool_lp`,
    };
    tokensData[getTokenBySymbol(`token-wever`).address.toString()] = {
      decimals: 9,
      symbol: `token-wever`,
    };

    const poolsNames = [
      "DexPair_token-wever_token-6-0",
      "DexPair_token-wever_token-6-1",
      "DexStablePool_token-6-0_token-9-0_token-18-0",
      "DexPair_DexStablePool_lp_token-9-1",
      "DexPair_token-6-1_token-9-1",
      "DexPair_token-6-0_token-6-1",
      "DexStablePair_token-6-0_token-9-0",
    ];

    // initial deposit
    for (let poolName of poolsNames) {
      const pool = locklift.deployments.getContract<DexPairAbi>(poolName);
      const poolType = await pool.methods
        .getPoolType({ answerId: 0 })
        .call()
        .then(a => Number(a.value0));
      let roots: any = await pool.methods.getTokenRoots({ answerId: 0 }).call();
      const lp = roots.lp;
      let tokenRoots: Address[];
      if (poolType === 1 || poolType === 2) {
        tokenRoots = [roots.left, roots.right];
      } else {
        tokenRoots = roots.roots;
      }

      await depositLiquidity(
        owner.address,
        dexAccount,
        pool,
        tokenRoots.map(root => {
          return {
            root,
            amount: new BigNumber(100)
              .shiftedBy(tokensData[root.toString()].decimals)
              .toString(),
          };
        }),
      );
      poolsData[pool.address.toString()] = {
        lp,
        roots: tokenRoots,
        poolType,
        symbol: poolName,
      };
    }
  });

  describe("Ever to Tip3", async function () {
    it("DexPair -> DexStablePair -> DexStablePool", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          `token-wever`,
        );
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
        },
        {
          outcoming: getTokenBySymbol("token-18-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
      ];

      const exchangeData = await getCrossPoolExchangeData(
        startToken.address,
        startAmount,
        route,
      );

      expect(exchangeData.received.amount).to.not.equal(
        "0",
        `Wrong received amount`,
      );

      const weverWallet = await getWeverWallet(route[0].pool.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        await weverWallet.methods
          .acceptNative({
            amount: startAmount,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            payload: exchangeData.payload,
          })
          .send({
            amount: new BigNumber(startAmount)
              .plus(calcValue(exchangeData.gas, true))
              .toString(),
            from: owner.address,
          }),
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(
          await getWallet(owner.address, exchangeData.received.root).then(
            a => a.walletContract,
          ),
        );
      expect(accountReceivedTokensChange).to.equal(
        exchangeData.received.amount,
        `Account has wrong received token balance`,
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(startToken.address),
          startToken.address,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(
        startAmount,
        "Dex has wrong wever balance",
      );
    });
  });

  describe("Ever + Wever to Tip3", async function () {
    it("DexPair -> DexStablePair -> DexStablePool", async function () {
      const account1 =
        locklift.deployments.getAccount("commonAccount-1").account;

      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          `token-wever`,
        );

      const everAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const weverAmount = new BigNumber(5)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const totalAmount = new BigNumber(everAmount)
        .plus(weverAmount)
        .toString();

      await transferWrapper(owner.address, account1.address, toNano(0.1), [
        { root: startToken.address, amount: weverAmount },
      ]);

      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
        },
        {
          outcoming: getTokenBySymbol("token-18-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
      ];

      const exchangeData = await getCrossPoolExchangeData(
        startToken.address,
        totalAmount,
        route,
      );

      expect(exchangeData.received.amount).to.not.equal(
        "0",
        `Wrong received amount`,
      );

      const weverWallet = await getWeverWallet(account1.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: totalAmount,
            recipient: route[0].pool.address,
            deployWalletValue: 0,
            remainingGasTo: account1.address,
            notify: true,
            payload: exchangeData.payload,
          })
          .send({
            amount: new BigNumber(everAmount)
              .plus(calcValue(exchangeData.gas, true))
              .toString(),
            from: account1.address,
          }),
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(
          await getWallet(account1.address, exchangeData.received.root).then(
            a => a.walletContract,
          ),
        );
      expect(accountReceivedTokensChange).to.equal(
        exchangeData.received.amount,
        `Account has wrong received token balance`,
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(startToken.address),
          startToken.address,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(
        totalAmount,
        "Dex has wrong wever balance",
      );
    });
  });

  describe("Tip3 to Ever", async function () {
    async function tip3ToEverTest(
      startToken: Address,
      startAmount: string,
      route: RouteStep[],
    ) {
      const exchangeData = await getCrossPoolExchangeData(
        startToken,
        startAmount,
        route,
        true,
      );

      expect(exchangeData.received.amount).to.not.equal(
        "0",
        `Wrong received amount`,
      );

      const tokenWallet = await getWallet(owner.address, startToken).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: startAmount,
            recipient: route[0].pool.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: exchangeData.payload,
          })
          .send({
            amount: calcValue(exchangeData.gas, true),
            from: owner.address,
          }),
      );

      const accountEversChange = traceTree.getBalanceDiff(owner.address);
      expect(Number(accountEversChange)).gt(
        new BigNumber(exchangeData.received.amount)
          .minus(calcValue(exchangeData.gas, true))
          .toNumber(),
        "Wrong Account ever balance",
      );
    }

    it("DexStablePool (deposit) -> DexPair -> DexPair -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-9-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("DexStablePool_lp").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-9-1").address,
          pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
        },
        {
          outcoming: getTokenBySymbol("token-6-1").address,
          pool: getPoolBySymbol(`DexPair_token-6-1_token-9-1`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-1`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });

    it("DexStablePair -> DexStablePool (deposit) -> DexPair -> DexPair -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
        },
        {
          outcoming: getTokenBySymbol("DexStablePool_lp").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-9-1").address,
          pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
        },
        {
          outcoming: getTokenBySymbol("token-6-1").address,
          pool: getPoolBySymbol(`DexPair_token-6-1_token-9-1`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-1`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });

    it("DexStablePool (withdrawal) -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          `DexStablePool_lp`,
        );
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });

    it("DexPair -> DexStablePool (withdrawal) -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-9-1`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("DexStablePool_lp").address,
          pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
        },
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });

    it("DexStablePool -> DexStablePair -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-18-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });

    it("DexStablePair -> DexStablePool -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route: RouteStep[] = [
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
        },
        {
          outcoming: getTokenBySymbol("token-6-0").address,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
        },
        {
          outcoming: getTokenBySymbol("token-wever").address,
          pool: getPoolBySymbol(`DexPair_token-wever_token-6-0`),
        },
      ];

      await tip3ToEverTest(startToken.address, startAmount, route);
    });
  });
});
