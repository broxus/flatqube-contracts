import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../../utils/gas.utils";
import { getPoolData, depositLiquidity } from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedWithdrawLiquidity,
  expectedWithdrawLiquidityOneCoin,
  getFeesFromTotalFee,
} from "../../utils/expected.utils";
import { getWallet } from "../../utils/wrappers";

describe("Check DexAccount add Pair", () => {
  let owner: Account;
  let gasValues: Contract<DexGasValuesAbi>;
  let commonAcc: Account;

  const poolsData: Record<
    string,
    {
      contract:
        | Contract<DexStablePairAbi>
        | Contract<DexPairAbi>
        | Contract<DexStablePoolAbi>;
      tokens: string[];
      roots: Contract<TokenRootUpgradeableAbi>[];
      lp: Contract<TokenRootUpgradeableAbi>;
    }
  > = {
    stablePair: {
      contract: null,
      tokens: ["token-6-0", "token-9-0"],
      roots: [],
      lp: null,
    },
    pair: {
      contract: null,
      tokens: ["token-9-0", "token-9-1"],
      roots: [],
      lp: null,
    },
    stablePool: {
      contract: null,
      tokens: ["token-6-0", "token-9-0", "token-18-0"],
      roots: [],
      lp: null,
    },
  };

  const tokensData: Record<string, { decimals: number }> = {};

  async function getPoolWithdrawGas(N: number) {
    return gasValues.methods
      .getPoolDirectWithdrawGas({
        numberOfCurrenciesToWithdraw: N,
        referrer: zeroAddress,
        deployWalletValue: toNano(0.1),
      })
      .call()
      .then(a => a.value0);
  }

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-pairs", "dex-gas-values"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    poolsData.pair.contract =
      locklift.deployments.getContract<DexStablePairAbi>(
        "DexPair_" + poolsData.pair.tokens.join("_"),
      );
    poolsData.stablePair.contract =
      locklift.deployments.getContract<DexStablePairAbi>(
        "DexStablePair_" + poolsData.stablePair.tokens.join("_"),
      );
    poolsData.stablePool.contract =
      locklift.deployments.getContract<DexStablePoolAbi>(
        "DexStablePool_" + poolsData.stablePool.tokens.join("_"),
      );

    for (const pool in poolsData) {
      poolsData[pool].roots = poolsData[pool].tokens.map((token: string) =>
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(token),
      );
      for (const root of poolsData[pool].roots) {
        tokensData[root.address.toString()] = {
          decimals: await root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        };
      }
      poolsData[pool].lp = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        await poolsData[pool].contract.methods
          .getTokenRoots({ answerId: 0 })
          .call()
          .then(a => a.lp),
      );
    }
    commonAcc = locklift.deployments.getAccount("commonAccount-2").account;
    // initial deposit liquidity to pools

    const dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    for (const pool in poolsData) {
      await depositLiquidity(
        owner.address,
        dexAccount,
        poolsData[pool].contract,
        poolsData[pool].roots.map(root => {
          return {
            root: root.address,
            amount: new BigNumber(100)
              .shiftedBy(tokensData[root.address.toString()].decimals)
              .toString(),
          };
        }),
      );
    }
  });
  describe("Direct withdraw from pair v1", () => {
    it("Withdraw from DexStablePair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidity", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePair.roots[0].address.toString()
        ].toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePair.roots[1].address.toString()
        ].toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw from DexPair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidity(
        poolsData.pair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexPairAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidity", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.pair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.pair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.pair.roots[0].address.toString()
        ].toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.pair.roots[1].address.toString()
        ].toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
  describe("Direct withdraw from pair v2", () => {
    it("Withdraw from DexStablePair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: Object.values(expectedWithdrawData.amounts)[0],
          _expectedRightAmount: Object.values(expectedWithdrawData.amounts)[1],
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidity", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePair.roots[0].address.toString()
        ].toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePair.roots[1].address.toString()
        ].toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw from DexPair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidity(
        poolsData.pair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexPairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: Object.values(expectedWithdrawData.amounts)[0],
          _expectedRightAmount: Object.values(expectedWithdrawData.amounts)[1],
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidity", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.pair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.pair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.pair.roots[0].address.toString()
        ].toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.pair.roots[1].address.toString()
        ].toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
  describe("Direct withdraw from DexStablePool", () => {
    it("Withdraw from DexStablePool", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amounts: Object.values(expectedWithdrawData.amounts),
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePool.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePool.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .minus(
            expectedWithdrawData.amounts[
              poolsData.stablePool.roots[2].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePool.roots[0].address.toString()
        ].toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePool.roots[1].address.toString()
        ].toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.amounts[
          poolsData.stablePool.roots[2].address.toString()
        ].toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw first token from DexStablePool via expectedOneCoinWithdrawalSpendAmount", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedWithdrawData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedOneCoinWithdrawalSpendAmount({
          receive_amount: expectedAmountFirstToken,
          receive_token_root: poolsData.stablePool.roots[0].address,
          answerId: 0,
        })
        .call();

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedAmountFirstToken,
          outcoming: poolsData.stablePool.roots[0].address,
          recipient: commonAcc.address,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: expectedWithdrawData.lp,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);
      const firstTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);
      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .minus(expectedAmountFirstToken)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePool.contract,
              expectedWithdrawData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(Number(accountFirstAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountFirstToken),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .minus(expectedWithdrawData.lp)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw second token from DexStablePool via expectedOneCoinWithdrawalSpendAmount", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedWithdrawData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedOneCoinWithdrawalSpendAmount({
          receive_amount: expectedAmountSecondToken,
          receive_token_root: poolsData.stablePool.roots[1].address,
          answerId: 0,
        })
        .call();

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedAmountSecondToken,
          outcoming: poolsData.stablePool.roots[1].address,
          recipient: commonAcc.address,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: expectedWithdrawData.lp,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const secondTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .minus(expectedAmountSecondToken)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePool.contract,
              expectedWithdrawData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(Number(accountSecondAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountSecondToken),
      );

      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .minus(expectedWithdrawData.lp)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw third token from DexStablePool via expectedOneCoinWithdrawalSpendAmount", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedWithdrawData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedOneCoinWithdrawalSpendAmount({
          receive_amount: expectedAmountThirdToken,
          receive_token_root: poolsData.stablePool.roots[2].address,
          answerId: 0,
        })
        .call();

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedAmountThirdToken,
          outcoming: poolsData.stablePool.roots[2].address,
          recipient: commonAcc.address,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: expectedWithdrawData.lp,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const thirdTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .minus(expectedAmountThirdToken)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePool.contract,
              expectedWithdrawData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toNumber(),
      ).to.approximately(
        Number(
          poolDataEnd.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        ),
        new BigNumber(1)
          .shiftedBy(
            Math.max(
              0,
              tokensData[poolsData.stablePool.roots[2].address.toString()]
                .decimals - 9,
            ),
          )
          .toNumber(),
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(Number(accountThirdAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountThirdToken),
      );

      expect(
        new BigNumber(poolDataStart.lpSupply)
          .minus(expectedWithdrawData.lp)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw first token from DexStablePool", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract,
        lpAmount,
        poolsData.stablePool.roots[0].address,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedWithdrawData.receivedAmount,
          outcoming: poolsData.stablePool.roots[0].address,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .minus(expectedWithdrawData.receivedAmount)
          .minus(expectedWithdrawData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.receivedAmount.toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw second token from DexStablePool", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract,
        lpAmount,
        poolsData.stablePool.roots[1].address,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedWithdrawData.receivedAmount,
          outcoming: poolsData.stablePool.roots[1].address,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .minus(expectedWithdrawData.receivedAmount)
          .minus(expectedWithdrawData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.receivedAmount.toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Withdraw third token from DexStablePool", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6).toString();

      const expectedWithdrawData = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract,
        lpAmount,
        poolsData.stablePool.roots[2].address,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[1].address,
      ).then(a => a.walletContract);

      const thirdTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.roots[2].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedWithdrawData.receivedAmount,
          outcoming: poolsData.stablePool.roots[2].address,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          to_native: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .minus(expectedWithdrawData.receivedAmount)
          .minus(expectedWithdrawData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        expectedWithdrawData.receivedAmount.toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
});
