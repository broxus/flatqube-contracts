import { expect } from "chai";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
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

const LP_DECIMALS = 9;

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
      roots: Address[];
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

  const tokensData: Record<string, { decimals: number; symbol: string }> = {};

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
      for (const token of poolsData[pool].tokens) {
        const root =
          locklift.deployments.getContract<TokenRootUpgradeableAbi>(token);
        poolsData[pool].roots.push(root.address);

        tokensData[root.address.toString()] = {
          decimals: await root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
          symbol: token,
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
            root: root,
            amount: new BigNumber(100)
              .shiftedBy(tokensData[root.toString()].decimals)
              .toString(),
          };
        }),
      );
    }
  });

  describe("Direct withdraw from pair v1", () => {
    it("Withdraw from DexPair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.pair.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.pair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
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
            deployWalletValue: 0,
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

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(
          new BigNumber(bal).minus(expected.amounts[root]).toString(),
        ).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.pair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexStablePair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.stablePair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

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
            deployWalletValue: 0,
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

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(
          new BigNumber(bal).minus(expected.amounts[root]).toString(),
        ).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
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
    it("Withdraw from DexPair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.pair.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.pair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: Object.values(expected.amounts)[0],
          _expectedRightAmount: Object.values(expected.amounts)[1],
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
            deployWalletValue: 0,
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

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(
          new BigNumber(bal).minus(expected.amounts[root]).toString(),
        ).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.pair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexStablePair", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.stablePair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: Object.values(expected.amounts)[0],
          _expectedRightAmount: Object.values(expected.amounts)[1],
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
            deployWalletValue: 0,
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

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(
          new BigNumber(bal).minus(expected.amounts[root]).toString(),
        ).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexPair, expected_amount > received amount (revert)", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.pair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.pair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: new BigNumber(Object.values(expected.amounts)[0])
            .plus(1)
            .toString(),
          _expectedRightAmount: Object.values(expected.amounts)[1],
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
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(bal).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.pair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          "0",
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexStablePair, expected_amount > received amount (revert)", async () => {
      const gas = await getPoolWithdrawGas(2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.stablePair.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: new BigNumber(Object.values(expected.amounts)[0])
            .plus(1)
            .toString(),
          _expectedRightAmount: Object.values(expected.amounts)[1],
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
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(bal).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePair.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          "0",
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });

  describe("Direct withdraw from DexStablePool", () => {
    for (const tokenIndex of [0, 1, 2]) {
      it(`Withdraw Token${tokenIndex + 1} from DexStablePool`, async () => {
        const receivedTokenRoot = poolsData.stablePool.roots[tokenIndex];

        const gas = await getPoolWithdrawGas(1);
        const poolDataStart = await getPoolData(poolsData.stablePool.contract);
        const lpAmount = new BigNumber(5).shiftedBy(LP_DECIMALS).toString();

        const expected = await expectedWithdrawLiquidityOneCoin(
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
          lpAmount,
          receivedTokenRoot,
        );

        const lpTokenWallet = await getWallet(
          owner.address,
          poolsData.stablePool.lp.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>
        ).methods
          .buildWithdrawLiquidityOneCoinPayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
            expected_amount: expected.receivedAmount,
            outcoming: receivedTokenRoot,
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

        const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

        expect(
          new BigNumber(poolDataStart.balances[receivedTokenRoot.toString()])
            .minus(expected.receivedAmount)
            .minus(expected.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.toString()],
          `Pool has wrong ${
            tokensData[receivedTokenRoot.toString()].symbol
          } balance`,
        );

        expect(
          new BigNumber(
            poolDataStart.accumulatedFees[receivedTokenRoot.toString()],
          )
            .plus(expected.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.accumulatedFees[receivedTokenRoot.toString()],
          `Pool has wrong ${
            tokensData[receivedTokenRoot.toString()].symbol
          } fees`,
        );

        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);
        expect(accountReceivedTokensChange).to.equal(
          expected.receivedAmount,
          `Account has wrong ${
            tokensData[receivedTokenRoot.toString()].symbol
          } balance`,
        );

        expect(
          new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }

    it("Withdraw one coin from DexStablePool via expectedOneCoinWithdrawalSpendAmount", async () => {
      const receivedTokenRoot = poolsData.stablePool.roots[0];

      const gas = await getPoolWithdrawGas(1);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmount = new BigNumber(85)
        .shiftedBy(tokensData[receivedTokenRoot.toString()].decimals)
        .toString();
      const spentData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedOneCoinWithdrawalSpendAmount({
          receive_amount: expectedAmount,
          receive_token_root: receivedTokenRoot,
          answerId: 0,
        })
        .call();

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        commonAcc.address,
        receivedTokenRoot,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedAmount,
          outcoming: receivedTokenRoot,
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
            amount: spentData.lp,
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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(poolDataStart.balances[receivedTokenRoot.toString()])
          .minus(expectedAmount)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePool.contract,
              spentData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receivedTokenRoot.toString()],
        `Pool has wrong received token balance`,
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);
      expect(Number(accountReceivedTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmount),
        `Account has wrong received token balance`,
      );

      expect(
        new BigNumber(poolDataStart.lpSupply).minus(spentData.lp).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw one coin from DexStablePool, expected_amount > received amount (revert)", async () => {
      const receivedTokenRoot = poolsData.stablePool.roots[0];

      const gas = await getPoolWithdrawGas(1);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(5).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        lpAmount,
        receivedTokenRoot,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        owner.address,
        receivedTokenRoot,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          outcoming: receivedTokenRoot,
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
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(poolDataStart.balances[receivedTokenRoot.toString()]).to.equal(
        poolDataEnd.balances[receivedTokenRoot.toString()],
        `Pool has wrong ${
          tokensData[receivedTokenRoot.toString()].symbol
        } balance`,
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);
      expect(accountReceivedTokensChange).to.equal(
        "0",
        `Account has wrong received balance`,
      );

      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexStablePool (pool imbalance)", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.stablePool.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amounts: Object.values(expected.amounts),
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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(
          new BigNumber(bal).minus(expected.amounts[root]).toString(),
        ).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePool.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw from DexStablePool, expected_amount > received amount (revert)", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(10).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const tokensWallets = await Promise.all(
        poolsData.stablePool.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const expectedAmounts = Object.values(expected.amounts);
      expectedAmounts[2] = new BigNumber(expectedAmounts[2]).plus(1).toString();

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amounts: expectedAmounts,
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
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      Object.entries(poolDataStart.balances).forEach(([root, bal]) => {
        expect(bal).to.equal(
          poolDataEnd.balances[root],
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePool.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          "0",
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Withdraw all lp_tokens from DexStablePool", async () => {
      const gas = await getPoolWithdrawGas(3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const lpAmount = await lpTokenWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );
      Object.entries(expected.amounts).forEach(([root, expectedAmount]) => {
        expect(
          new BigNumber(poolDataStart.balances[root])
            .multipliedBy(lpAmount)
            .dividedBy(poolDataStart.lpSupply)
            .dp(0, BigNumber.ROUND_FLOOR)
            .toString(),
        ).to.equal(
          expectedAmount,
          `Wrong ${tokensData[root].symbol} expected amount`,
        );
      });

      const tokensWallets = await Promise.all(
        poolsData.stablePool.roots.map(root =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amounts: Object.values(expected.amounts),
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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      Object.entries(poolDataEnd.balances).forEach(([root, bal]) => {
        expect(bal).to.equal(
          "0",
          `Pool has wrong ${tokensData[root].symbol} balance`,
        );
      });

      const tokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet.address),
      );
      poolsData.stablePool.roots.forEach((root, i) =>
        expect(tokensChange[i]).to.equal(
          expected.amounts[root.toString()],
          `Account has wrong ${tokensData[root.toString()].symbol} balance`,
        ),
      );

      expect(poolDataEnd.lpSupply).to.equal("0", "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
});
