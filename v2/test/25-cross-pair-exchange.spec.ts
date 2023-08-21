import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";

import { expect } from "chai";
import BigNumber from "bignumber.js";

BigNumber.config({ EXPONENTIAL_AT: 257 });
import { TOKENS_N, TOKENS_DECIMALS } from "../../utils/consts";
import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { Account } from "locklift/everscale-client";
import {
  depositLiquidity,
  getExpectedTokenVault,
  getPoolData,
  getWallet,
} from "../../utils/wrappers";
import { expectedExchange } from "../utils/math.utils";
import { calcValue } from "../utils/gas.utils";

describe("Check direct CrossPairExchange v1", async function () {
  let owner: Account;
  let dexAccount: Contract<DexAccountAbi>;
  let dexRoot: Contract<DexRootAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let tokensData: Record<string, { decimals: number }> = {};

  async function crossPoolExchangeTest(
    startToken: Address,
    startAmount: string,
    route: {
      token: Contract<TokenRootUpgradeableAbi>;
      pool: Contract<DexPairAbi> | Contract<DexStablePairAbi>;
    }[],
    failedStepIndex: number = undefined,
  ) {
    const poolsDataStart = await Promise.all(
      route.map(async step => getPoolData(step.pool)),
    );
    const steps: { root: Address; amount: string }[] = [];
    const expectedData: {
      receivedAmount: string;
      beneficiaryFee: string;
      poolFee: string;
    }[] = [];
    for (let i = 0; i < route.length; i++) {
      const amount = i === 0 ? startAmount : steps[i - 1].amount;
      const receiveTokenRoot = route[i].token.address;

      const expected = await expectedExchange(
        route[i].pool,
        amount,
        i === 0 ? startToken : steps[i - 1].root,
      );

      expectedData.push(expected);
      steps.push({
        root: receiveTokenRoot,
        amount:
          i !== failedStepIndex
            ? expected.receivedAmount
            : new BigNumber(expected.receivedAmount).plus(1).toString(),
      });
    }

    const payload = await route[0].pool.methods
      .buildCrossPairExchangePayload({
        id: getRandomNonce(),
        deploy_wallet_grams: toNano(0.1),
        expected_amount: steps[0].amount,
        steps: steps.slice(1),
      })
      .call()
      .then(a => a.value0);

    const spentWallet = await getWallet(owner.address, startToken).then(
      data => data.walletContract,
    );

    const gas = await gasValues.methods
      .getPoolCrossExchangeGas({
        steps: route.length,
        leaves: 1,
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
      })
      .call()
      .then(a => a.value0);

    const { traceTree } = await locklift.tracing.trace(
      spentWallet.methods
        .transfer({
          amount: startAmount,
          recipient: route[0].pool.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: owner.address,
          notify: true,
          payload: payload,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas, true),
        }),
    );

    const poolsDataEnd = await Promise.all(
      route.map(async step => getPoolData(step.pool)),
    );

    steps.forEach((start, i) => {
      const spentToken = i === 0 ? startToken : steps[i - 1].root;
      const receivedToken = steps[i].root;

      let spentAmount;
      if (failedStepIndex !== undefined && i >= failedStepIndex) {
        spentAmount = "0";
      } else if (i === 0) {
        spentAmount = startAmount;
      } else {
        spentAmount = steps[i - 1].amount;
      }
      const receivedAmount =
        failedStepIndex !== undefined && i >= failedStepIndex
          ? "0"
          : steps[i].amount;

      expect(
        new BigNumber(poolsDataStart[i].balances[spentToken.toString()])
          .plus(spentAmount)
          .minus(expectedData[i].beneficiaryFee)
          .toString(),
      ).to.equal(poolsDataEnd[i].balances[spentToken.toString()]);

      expect(
        new BigNumber(poolsDataStart[i].accumulatedFees[spentToken.toString()])
          .plus(expectedData[i].beneficiaryFee)
          .toString(),
      ).to.equal(poolsDataEnd[i].accumulatedFees[spentToken.toString()]);

      expect(
        new BigNumber(poolsDataStart[i].balances[receivedToken.toString()])
          .minus(receivedAmount)
          .toString(),
      ).to.equal(poolsDataEnd[i].balances[receivedToken.toString()]);
    });

    let lastStepIndex;
    if (failedStepIndex === undefined) {
      lastStepIndex = steps.length - 1;
    } else if (failedStepIndex === 0) {
      lastStepIndex = undefined;
    } else {
      lastStepIndex = failedStepIndex - 1;
    }

    const spentAccountChange =
      traceTree?.tokens.getTokenBalanceChange(spentWallet);
    const spentDexChange = traceTree?.tokens.getTokenBalanceChange(
      await getWallet(await getExpectedTokenVault(startToken), startToken).then(
        a => a.walletContract,
      ),
    );

    expect(spentAccountChange).to.equal(
      lastStepIndex !== undefined ? (-startAmount).toString() : "0",
    );
    expect(spentDexChange).to.equal(
      lastStepIndex !== undefined ? startAmount : "0",
    );

    if (lastStepIndex !== undefined) {
      const receivedAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, steps[lastStepIndex].root).then(
          a => a.walletContract,
        ),
      );
      const recevedDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVault(steps[lastStepIndex].root),
          steps[lastStepIndex].root,
        ).then(a => a.walletContract),
      );

      expect(receivedAccountChange).to.equal(steps[lastStepIndex].amount);
      expect(recevedDexChange).to.equal(
        new BigNumber(steps[lastStepIndex].amount).multipliedBy(-1).toString(),
      );
    }
  }

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-accounts", "dex-pairs"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;
    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    for (let i = 0; i < TOKENS_N; ++i) {
      for (let decimal of TOKENS_DECIMALS) {
        const token = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          `token-${decimal}-${i}`,
        );
        tokensData[token.address.toString()] = {
          decimals: await token.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        };
      }
    }

    const poolsNames = [
      "DexPair_token-6-0_token-6-1",
      "DexPair_token-9-0_token-9-1",
      "DexPair_token-9-1_token-18-1",
      "DexStablePair_token-6-0_token-9-0",
      "DexStablePair_token-9-0_token-18-0",
    ];

    // initial deposit
    for (let poolName of poolsNames) {
      const pool = locklift.deployments.getContract<DexPairAbi>(poolName);
      const roots = await pool.methods.getTokenRoots({ answerId: 0 }).call();
      await depositLiquidity(owner.address, dexAccount, pool, [
        {
          root: roots.left,
          amount: new BigNumber(100)
            .shiftedBy(tokensData[roots.left.toString()].decimals)
            .toString(),
        },
        {
          root: roots.right,
          amount: new BigNumber(100)
            .shiftedBy(tokensData[roots.right.toString()].decimals)
            .toString(),
        },
      ]);
    }
  });

  describe("Direct cross-pair exchange", async function () {
    it("DexPair -> DexStablePair -> DexStablePair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-1`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-6-0",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            `DexPair_token-6-0_token-6-1`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-6-0_token-9-0",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-9-0_token-18-0",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it("DexStablePair -> DexPair -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            `DexStablePair_token-6-0_token-9-0`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-0_token-9-1",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-1_token-18-1",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it("DexPair -> DexStablePair -> DexStablePair (failed)", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-1`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-6-0",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            `DexPair_token-6-0_token-6-1`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-6-0_token-9-0",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-9-0_token-18-0",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route, 2);
    });

    it("DexStablePair -> DexPair (failed) -> DexPair", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            `DexStablePair_token-6-0_token-9-0`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-0_token-9-1",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-1_token-18-1",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route, 1);
    });

    it("DexPair (failed) -> DexStablePair -> DexStablePair (revert)", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-1`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-6-0",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            `DexPair_token-6-0_token-6-1`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-6-0_token-9-0",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            "DexStablePair_token-9-0_token-18-0",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route, 0);
    });

    it("DexStablePair (failed) -> DexPair -> DexPair (revert)", async function () {
      const startToken =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-0",
            ),
          pool: locklift.deployments.getContract<DexStablePairAbi>(
            `DexStablePair_token-6-0_token-9-0`,
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-9-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-0_token-9-1",
          ),
        },
        {
          token:
            locklift.deployments.getContract<TokenRootUpgradeableAbi>(
              "token-18-1",
            ),
          pool: locklift.deployments.getContract<DexPairAbi>(
            "DexPair_token-9-1_token-18-1",
          ),
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route, 0);
    });
  });
});
