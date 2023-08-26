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
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { Account } from "locklift/everscale-client";
import { depositLiquidity, getPoolData, getWallet } from "../../utils/wrappers";
import {
  expectedDepositLiquidityOneCoin,
  expectedExchange,
  expectedWithdrawLiquidityOneCoin,
} from "../../utils/expected.utils";
import { calcValue } from "../utils/gas.utils";

describe("Check direct CrossPairExchange v1", async function () {
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

  async function getRouteDexPoolsInfo(route: any, poolsMap: any) {
    for (let elem of route) {
      poolsMap[elem.pool.address.toString()] = await getPoolData(elem.pool);

      await getRouteDexPoolsInfo(elem.nextSteps, poolsMap);
    }
  }

  async function crossPoolExchangeTest(
    startToken: Address,
    startAmount: string,
    route: any,
  ) {
    const poolsStart: Record<string, any> = {};
    await getRouteDexPoolsInfo(route, poolsStart);

    let steps: any[] = [];
    let leaves = 0;

    async function getRouteDexPoolsExpected(
      route: any,
      spentToken: Address,
      spentAmount: string,
      poolsMap: any,
    ) {
      let denominator = route.reduce(
        (partialSum: number, elem: any) => partialSum + elem.numerator,
        0,
      );

      let nextIndices: number[] = [];

      for (let elem of route) {
        let elemSpentAmount = new BigNumber(spentAmount)
          .multipliedBy(elem.numerator)
          .dividedToIntegerBy(denominator)
          .toString();

        let expected;
        let receivedAmount: string;
        let start = poolsStart[elem.pool.address.toString()];

        if (spentToken.equals(poolsData[elem.pool.address.toString()].lp)) {
          expected = await expectedWithdrawLiquidityOneCoin(
            elem.pool,
            elemSpentAmount,
            elem.outcoming,
          );
          receivedAmount = elem.failed
            ? new BigNumber(expected.receivedAmount).multipliedBy(2).toString()
            : expected.receivedAmount;

          if (!elem.failed) {
            start.balances[elem.outcoming.toString()] = new BigNumber(
              start.balances[elem.outcoming.toString()],
            )
              .minus(expected.receivedAmount)
              .minus(expected.beneficiaryFee)
              .toString();

            start.accumulatedFees[elem.outcoming.toString()] = new BigNumber(
              start.accumulatedFees[elem.outcoming.toString()],
            )
              .plus(expected.beneficiaryFee)
              .toString();

            start.lpSupply = new BigNumber(start.lpSupply)
              .minus(elemSpentAmount)
              .toString();
          }
        } else if (
          elem.outcoming.equals(poolsData[elem.pool.address.toString()].lp)
        ) {
          expected = await expectedDepositLiquidityOneCoin(
            elem.pool,
            elemSpentAmount,
            spentToken,
          );
          receivedAmount = elem.failed
            ? new BigNumber(expected.lpReward).multipliedBy(2).toString()
            : expected.lpReward;

          if (!elem.failed) {
            start.balances[spentToken.toString()] = new BigNumber(
              start.balances[spentToken.toString()],
            )
              .plus(elemSpentAmount)
              .minus(expected.beneficiaryFee)
              .toString();

            start.accumulatedFees[spentToken.toString()] = new BigNumber(
              start.accumulatedFees[spentToken.toString()],
            )
              .plus(expected.beneficiaryFee)
              .toString();

            start.lpSupply = new BigNumber(start.lpSupply)
              .plus(expected.lpReward)
              .toString();
          }
        } else {
          expected = await expectedExchange(
            elem.pool,
            elemSpentAmount,
            spentToken,
            elem.outcoming,
          );
          receivedAmount = elem.failed
            ? new BigNumber(expected.receivedAmount).multipliedBy(2).toString()
            : expected.receivedAmount;

          if (!elem.failed) {
            start.balances[spentToken.toString()] = new BigNumber(
              start.balances[spentToken.toString()],
            )
              .plus(elemSpentAmount)
              .minus(expected.beneficiaryFee)
              .toString();

            start.accumulatedFees[spentToken.toString()] = new BigNumber(
              start.accumulatedFees[spentToken.toString()],
            )
              .plus(expected.beneficiaryFee)
              .toString();

            start.balances[elem.outcoming.toString()] = new BigNumber(
              start.balances[elem.outcoming.toString()],
            )
              .minus(expected.receivedAmount)
              .toString();
          }
        }
        poolsMap[elem.pool.address.toString()] = start;

        let nextStepIndices = await getRouteDexPoolsExpected(
          elem.nextSteps,
          elem.outcoming,
          elem.failed ? "0" : receivedAmount,
          poolsMap,
        );

        steps.push({
          amount: receivedAmount,
          roots: poolsData[elem.pool.address.toString()].roots,
          outcoming: elem.outcoming,
          numerator: elem.numerator,
          nextStepIndices: nextStepIndices,
        });

        nextIndices.push(steps.length - 1);

        if (elem.failed) {
          leaves += 1;
          const amount = finalTokens[spentToken.toString()]
            ? finalTokens[spentToken.toString()]
            : "0";
          finalTokens[spentToken.toString()] = new BigNumber(amount)
            .plus(elemSpentAmount)
            .toString();
        }
      }

      if (!route.length && spentAmount !== "0") {
        leaves += 1;
        const amount = finalTokens[spentToken.toString()]
          ? finalTokens[spentToken.toString()]
          : "0";
        finalTokens[spentToken.toString()] = new BigNumber(amount)
          .plus(spentAmount)
          .toString();
      }

      return nextIndices;
    }

    const poolsExpected = {};
    const finalTokens: Record<string, string> = {};
    const nextIndices = await getRouteDexPoolsExpected(
      route,
      startToken,
      startAmount,
      poolsExpected,
    );

    let payload;
    if (poolsData[route[0].pool.address.toString()].poolType === 3) {
      payload = await (route[0].pool as Contract<DexStablePoolAbi>).methods
        .buildCrossPairExchangePayload({
          id: getRandomNonce(),
          deployWalletGrams: toNano(0.1),
          expectedAmount: steps[nextIndices[0]].amount,
          outcoming: steps[nextIndices[0]].outcoming,
          nextStepIndices: steps[nextIndices[0]].nextStepIndices,
          steps: steps,
          recipient: owner.address,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
          to_native: false,
        })
        .call()
        .then(a => a.value0);
    } else {
      payload = await (route[0].pool as Contract<DexPairAbi>).methods
        .buildCrossPairExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: steps[nextIndices[0]].amount,
          _outcoming: steps[nextIndices[0]].outcoming,
          _nextStepIndices: steps[nextIndices[0]].nextStepIndices,
          _steps: steps,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call()
        .then(a => a.value0);
    }

    const spentWallet = await getWallet(owner.address, startToken).then(
      a => a.walletContract,
    );

    const gas = await gasValues.methods
      .getPoolCrossExchangeGas({
        steps: steps.length,
        leaves: leaves,
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
          deployWalletValue: 0,
          remainingGasTo: owner.address,
          notify: true,
          payload: payload,
        })
        .send({ from: owner.address, amount: calcValue(gas, true) }),
    );

    const poolsEnd: Record<string, any> = {};
    await getRouteDexPoolsInfo(route, poolsEnd);

    Object.entries(poolsExpected).forEach(([pool, data]) => {
      Object.entries(data.balances).forEach(([root, bal]) =>
        expect(bal).to.equal(
          poolsEnd[pool].balances[root],
          `Wrong ${tokensData[root].symbol} balance in ${poolsData[pool].symbol}`,
        ),
      );
      Object.entries(data.accumulatedFees).forEach(([root, bal]) =>
        expect(bal).to.equal(
          poolsEnd[pool].accumulatedFees[root],
          `Wrong ${tokensData[root].symbol} accumulated fee in ${poolsData[pool].symbol}`,
        ),
      );
      expect(data.lpSupply).to.equal(
        poolsEnd[pool].lpSupply,
        `Wrong Lp balance in ${poolsData[pool].symbol}`,
      );
    });

    const accountSpentTokenChange =
      traceTree?.tokens.getTokenBalanceChange(spentWallet);
    expect(
      new BigNumber(accountSpentTokenChange).multipliedBy(-1).toString(),
    ).to.equal(startAmount, "Wrong account spent token balance");

    for (let [root, amount] of Object.entries(finalTokens)) {
      const receivedWallet = await getWallet(
        owner.address,
        new Address(root),
      ).then(a => a.walletContract);
      const tokenChange =
        traceTree?.tokens.getTokenBalanceChange(receivedWallet);
      expect(tokenChange).to.equal(
        amount,
        `Wrong account received ${tokensData[root].symbol} balance`,
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

    const poolsNames = [
      "DexPair_token-6-0_token-6-1",
      "DexStablePool_token-6-0_token-9-0_token-18-0",
      "DexPair_DexStablePool_lp_token-9-1",
      "DexPair_token-9-0_token-9-1",
      "DexStablePair_token-6-0_token-9-0",
      "DexStablePair_token-9-0_token-18-0",
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

  describe("Direct split-cross-pool exchange", async function () {
    it("DexStablePool deposit -> DexPair -> DexPair -> DexStablePair", async function () {
      const startToken = getTokenBySymbol(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          outcoming: getTokenBySymbol("DexStablePool_lp").address,
          numerator: 1,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
          nextSteps: [
            {
              outcoming: getTokenBySymbol("token-9-1").address,
              numerator: 1,
              pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
              nextSteps: [
                {
                  outcoming: getTokenBySymbol("token-9-0").address,
                  numerator: 1,
                  pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
                  nextSteps: [
                    {
                      outcoming: getTokenBySymbol("token-18-0").address,
                      numerator: 1,
                      pool: getPoolBySymbol(
                        `DexStablePair_token-9-0_token-18-0`,
                      ),
                      nextSteps: [] as any,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it(
      "DexStablePool withdrawal\n" +
        "         -> (1) DexPair\n" +
        "         -> (2) DexStablePair",
      async function () {
        const startToken = getTokenBySymbol(`DexStablePool_lp`);
        const startAmount = new BigNumber(10)
          .shiftedBy(tokensData[startToken.address.toString()].decimals)
          .toString();
        const route = [
          {
            outcoming: getTokenBySymbol("token-9-0").address,
            numerator: 1,
            pool: getPoolBySymbol(
              `DexStablePool_token-6-0_token-9-0_token-18-0`,
            ),
            nextSteps: [
              {
                outcoming: getTokenBySymbol("token-9-1").address,
                numerator: 1,
                pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
                nextSteps: [] as any,
              },
              {
                outcoming: getTokenBySymbol("token-18-0").address,
                numerator: 2,
                pool: getPoolBySymbol(`DexStablePair_token-9-0_token-18-0`),
                nextSteps: [],
              },
            ],
          },
        ];

        await crossPoolExchangeTest(startToken.address, startAmount, route);
      },
    );

    it("DexStablePair -> DexStablePool deposit -> DexPair", async function () {
      const startToken = getTokenBySymbol(`token-18-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          numerator: 1,
          pool: getPoolBySymbol(`DexStablePair_token-9-0_token-18-0`),
          nextSteps: [
            {
              outcoming: getTokenBySymbol("DexStablePool_lp").address,
              numerator: 1,
              pool: getPoolBySymbol(
                `DexStablePool_token-6-0_token-9-0_token-18-0`,
              ),
              nextSteps: [
                {
                  outcoming: getTokenBySymbol("token-9-1").address,
                  numerator: 1,
                  pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
                  nextSteps: [] as any,
                },
              ],
            },
          ],
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it("DexPair -> DexStablePool withdrawal -> DexStablePair -> DexStablePair", async function () {
      const startToken = getTokenBySymbol(`token-9-1`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          outcoming: getTokenBySymbol("DexStablePool_lp").address,
          numerator: 1,
          pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
          nextSteps: [
            {
              outcoming: getTokenBySymbol("token-6-0").address,
              numerator: 1,
              pool: getPoolBySymbol(
                `DexStablePool_token-6-0_token-9-0_token-18-0`,
              ),
              nextSteps: [
                {
                  outcoming: getTokenBySymbol("token-9-0").address,
                  numerator: 1,
                  pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
                  nextSteps: [
                    {
                      outcoming: getTokenBySymbol("token-18-0").address,
                      numerator: 1,
                      pool: getPoolBySymbol(
                        `DexStablePair_token-9-0_token-18-0`,
                      ),
                      nextSteps: [] as any,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it(
      "DexPair\n" +
        "         -> (1) DexStablePool deposit\n" +
        "         -> (1) DexStablePair -> DexPair",
      async function () {
        const startToken = getTokenBySymbol(`token-9-1`);
        const startAmount = new BigNumber(10)
          .shiftedBy(tokensData[startToken.address.toString()].decimals)
          .toString();
        const route = [
          {
            outcoming: getTokenBySymbol("token-9-0").address,
            numerator: 1,
            pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
            nextSteps: [
              {
                outcoming: getTokenBySymbol("DexStablePool_lp").address,
                numerator: 1,
                pool: getPoolBySymbol(
                  `DexStablePool_token-6-0_token-9-0_token-18-0`,
                ),
                nextSteps: [] as any,
              },
              {
                outcoming: getTokenBySymbol("token-6-0").address,
                numerator: 1,
                pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
                nextSteps: [
                  {
                    outcoming: getTokenBySymbol("token-6-1").address,
                    numerator: 1,
                    pool: getPoolBySymbol(`DexPair_token-6-0_token-6-1`),
                    nextSteps: [],
                  },
                ],
              },
            ],
          },
        ];

        await crossPoolExchangeTest(startToken.address, startAmount, route);
      },
    );

    it(
      "DexStablePair -> DexStablePool exchange\n" +
        "                       -> (3) DexPair\n" +
        "                       -> (5) DexStablePair",
      async function () {
        const startToken = getTokenBySymbol(`token-18-0`);
        const startAmount = new BigNumber(10)
          .shiftedBy(tokensData[startToken.address.toString()].decimals)
          .toString();
        const route = [
          {
            outcoming: getTokenBySymbol("token-9-0").address,
            numerator: 1,
            pool: getPoolBySymbol(`DexStablePair_token-9-0_token-18-0`),
            nextSteps: [
              {
                outcoming: getTokenBySymbol("token-6-0").address,
                numerator: 1,
                pool: getPoolBySymbol(
                  `DexStablePool_token-6-0_token-9-0_token-18-0`,
                ),
                nextSteps: [
                  {
                    outcoming: getTokenBySymbol("token-6-1").address,
                    numerator: 3,
                    pool: getPoolBySymbol(`DexPair_token-6-0_token-6-1`),
                    nextSteps: [] as any,
                  },
                  {
                    outcoming: getTokenBySymbol("token-9-0").address,
                    numerator: 5,
                    pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
                    nextSteps: [],
                  },
                ],
              },
            ],
          },
        ];

        await crossPoolExchangeTest(startToken.address, startAmount, route);
      },
    );

    it("DexStablePool exchange -> DexPair -> DexPair -> DexStablePool withdrawal (failed)", async function () {
      const startToken = getTokenBySymbol(`token-6-0`);
      const startAmount = new BigNumber(10)
        .shiftedBy(tokensData[startToken.address.toString()].decimals)
        .toString();
      const route = [
        {
          outcoming: getTokenBySymbol("token-9-0").address,
          numerator: 1,
          pool: getPoolBySymbol(`DexStablePool_token-6-0_token-9-0_token-18-0`),
          nextSteps: [
            {
              outcoming: getTokenBySymbol("token-9-1").address,
              numerator: 1,
              pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
              nextSteps: [
                {
                  outcoming: getTokenBySymbol("DexStablePool_lp").address,
                  numerator: 1,
                  pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
                  nextSteps: [
                    {
                      outcoming: getTokenBySymbol("token-18-0").address,
                      numerator: 1,
                      pool: getPoolBySymbol(
                        `DexStablePool_token-6-0_token-9-0_token-18-0`,
                      ),
                      nextSteps: [] as any,
                      failed: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      await crossPoolExchangeTest(startToken.address, startAmount, route);
    });

    it(
      "DexStablePair\n" +
        "         -> (1) DexStablePool exchange (failed)\n" +
        "         -> (1) DexStablePool deposit (failed)\n" +
        "         -> (2) DexPair -> DexPair -> DexStablePool withdrawal",
      async function () {
        const startToken = getTokenBySymbol(`token-18-0`);
        const startAmount = new BigNumber(10)
          .shiftedBy(tokensData[startToken.address.toString()].decimals)
          .toString();
        const route = [
          {
            outcoming: getTokenBySymbol("token-9-0").address,
            numerator: 1,
            pool: getPoolBySymbol(`DexStablePair_token-9-0_token-18-0`),
            nextSteps: [
              {
                outcoming: getTokenBySymbol("token-6-0").address,
                numerator: 1,
                pool: getPoolBySymbol(
                  `DexStablePool_token-6-0_token-9-0_token-18-0`,
                ),
                nextSteps: [] as any,
                failed: true,
              },
              {
                outcoming: getTokenBySymbol("DexStablePool_lp").address,
                numerator: 1,
                pool: getPoolBySymbol(
                  `DexStablePool_token-6-0_token-9-0_token-18-0`,
                ),
                nextSteps: [] as any,
                failed: true,
              },
              {
                outcoming: getTokenBySymbol("token-9-1").address,
                numerator: 2,
                pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
                nextSteps: [
                  {
                    outcoming: getTokenBySymbol("DexStablePool_lp").address,
                    numerator: 1,
                    pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
                    nextSteps: [
                      {
                        outcoming: getTokenBySymbol("token-6-0").address,
                        numerator: 1,
                        pool: getPoolBySymbol(
                          `DexStablePool_token-6-0_token-9-0_token-18-0`,
                        ),
                        nextSteps: [] as any,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ];

        await crossPoolExchangeTest(startToken.address, startAmount, route);
      },
    );

    it(
      "DexPair -> DexPair\n" +
        "           -> (1) DexStablePool exchange\n" +
        "           -> (3) DexStablePair\n" +
        "                       -> (1) DexPair\n" +
        "                       -> (1) DexStablePool exchange (failed)",
      async function () {
        const startToken = getTokenBySymbol(`DexStablePool_lp`);
        const startAmount = new BigNumber(10)
          .shiftedBy(tokensData[startToken.address.toString()].decimals)
          .toString();
        const route = [
          {
            outcoming: getTokenBySymbol("token-9-1").address,
            numerator: 1,
            pool: getPoolBySymbol(`DexPair_DexStablePool_lp_token-9-1`),
            nextSteps: [
              {
                outcoming: getTokenBySymbol("token-9-0").address,
                numerator: 1,
                pool: getPoolBySymbol(`DexPair_token-9-0_token-9-1`),
                nextSteps: [
                  {
                    outcoming: getTokenBySymbol("token-6-0").address,
                    numerator: 1,
                    pool: getPoolBySymbol(
                      `DexStablePool_token-6-0_token-9-0_token-18-0`,
                    ),
                    nextSteps: [],
                  },
                  {
                    outcoming: getTokenBySymbol("token-6-0").address,
                    numerator: 3,
                    pool: getPoolBySymbol(`DexStablePair_token-6-0_token-9-0`),
                    nextSteps: [
                      {
                        outcoming: getTokenBySymbol("token-6-1").address,
                        numerator: 1,
                        pool: getPoolBySymbol(`DexPair_token-6-0_token-6-1`),
                        nextSteps: [] as any,
                      },
                      {
                        outcoming: getTokenBySymbol("token-18-0").address,
                        numerator: 1,
                        pool: getPoolBySymbol(
                          `DexStablePool_token-6-0_token-9-0_token-18-0`,
                        ),
                        nextSteps: [] as any,
                        failed: true,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ];

        await crossPoolExchangeTest(startToken.address, startAmount, route);
      },
    );
  });
});
