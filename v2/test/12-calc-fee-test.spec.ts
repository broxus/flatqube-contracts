import { expect } from "chai";
import { Contract, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { depositLiquidity } from "../../utils/wrappers";
import { expectedExchange } from "../../utils/expected.utils";
import { addressComparator } from "../../utils/helpers";
import BigNumber from "bignumber.js";

interface FeeParams {
  feeNumerator: string;
  denominator: string;
}

describe("Check DexAccount add Pair", () => {
  let owner: Account;

  let poolsData: Record<
    string,
    {
      contract:
        | Contract<DexPairAbi>
        | Contract<DexStablePairAbi>
        | Contract<DexStablePoolAbi>;
      tokens: string[];
      roots: Contract<TokenRootUpgradeableAbi>[];
      feeParams: FeeParams;
    }
  > = {
    pair: {
      contract: null,
      tokens: ["token-9-0", "token-9-1"],
      roots: [],
      feeParams: null,
    },
    stablePair: {
      contract: null,
      tokens: ["token-6-0", "token-9-0"],
      roots: [],
      feeParams: null,
    },
    stablePool: {
      contract: null,
      tokens: ["token-6-0", "token-9-0", "token-18-0"],
      roots: [],
      feeParams: null,
    },
  };

  let tokensData: Record<string, { decimals: number }> = {};

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-pairs"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;

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
      for (let root of poolsData[pool].roots) {
        tokensData[root.address.toString()] = {
          decimals: await root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        };
      }
    }

    // initial deposit liquidity to pools

    const dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    for (let pool in poolsData) {
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
      const feeParams = await poolsData[pool].contract.methods
        .getFeeParams({ answerId: 0 })
        .call()
        .then(a => a.value0);
      poolsData[pool].feeParams = {
        feeNumerator: new BigNumber(feeParams.beneficiary_numerator)
          .plus(feeParams.pool_numerator)
          .plus(feeParams.referrer_numerator)
          .toString(),
        denominator: feeParams.denominator,
      };
    }
  });

  describe("Multiple coins deposit to pool", () => {
    it("Deposit to DexPair", async () => {
      const sortedTokens = [...poolsData.pair.roots].sort((a, b) =>
        addressComparator(a.address, b.address),
      );
      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(tokensData[sortedTokens[i].address.toString()].decimals)
          .toString(),
      );
      const expected = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .expectedDepositLiquidity({
          answerId: 0,
          left_amount: amounts[0],
          right_amount: amounts[1],
          auto_change: true,
          referrer: zeroAddress,
        })
        .call()
        .then(r => r.value0);

      expect(
        new BigNumber(expected.step_2_spent)
          .multipliedBy(poolsData.pair.feeParams.feeNumerator)
          .div(poolsData.pair.feeParams.denominator)
          .dp(0, BigNumber.ROUND_CEIL)
          .toString(),
      ).to.equal(expected.step_2_fee, "Wrong total fee");
    });

    it("Deposit to DexStablePair", async () => {
      const sortedTokens = [...poolsData.stablePair.roots].sort((a, b) =>
        addressComparator(a.address, b.address),
      );
      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(tokensData[sortedTokens[i].address.toString()].decimals)
          .toString(),
      );
      const expected = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .expectedDepositLiquidityV2({
          answerId: 0,
          amounts: amounts,
        })
        .call()
        .then(r => r.value0);

      const N_COINS = 2;
      const feeNumerator = new BigNumber(
        poolsData.stablePair.feeParams.feeNumerator,
      )
        .multipliedBy(N_COINS)
        .div(4 * (N_COINS - 1))
        .dp(0, BigNumber.ROUND_CEIL)
        .toString();

      expected.differences.forEach((diff, i) =>
        expect(
          new BigNumber(diff)
            .multipliedBy(feeNumerator)
            .div(poolsData.stablePair.feeParams.denominator)
            .dp(0, BigNumber.ROUND_CEIL)
            .toString(),
        ).to.equal(
          new BigNumber(expected.beneficiary_fees[i])
            .plus(expected.pool_fees[i])
            .toString(),
          "Wrong total fee",
        ),
      );
    });

    it("Deposit to DexStablePool", async () => {
      const sortedTokens = [...poolsData.stablePool.roots].sort((a, b) =>
        addressComparator(a.address, b.address),
      );
      const amounts = [1, 2, 3].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(tokensData[sortedTokens[i].address.toString()].decimals)
          .toString(),
      );
      const expected = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedDepositLiquidityV2({
          answerId: 0,
          amounts: amounts,
        })
        .call()
        .then(r => r.value0);

      const N_COINS = 3;
      const feeNumerator = new BigNumber(
        poolsData.stablePool.feeParams.feeNumerator,
      )
        .multipliedBy(N_COINS)
        .div(4 * (N_COINS - 1))
        .dp(0, BigNumber.ROUND_CEIL)
        .toString();

      expected.differences.forEach((diff, i) =>
        expect(
          new BigNumber(diff)
            .multipliedBy(feeNumerator)
            .div(poolsData.stablePool.feeParams.denominator)
            .dp(0, BigNumber.ROUND_CEIL)
            .toString(),
        ).to.equal(
          new BigNumber(expected.beneficiary_fees[i])
            .plus(expected.pool_fees[i])
            .toString(),
          "Wrong total fee",
        ),
      );
    });
  });

  describe("One coin deposit to pool", () => {
    it("Deposit to DexStablePool", async () => {
      const sortedTokens = [...poolsData.stablePool.roots].sort((a, b) =>
        addressComparator(a.address, b.address),
      );
      const amount = new BigNumber(1)
        .shiftedBy(tokensData[sortedTokens[0].address.toString()].decimals)
        .toString();
      const expected = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedDepositLiquidityOneCoin({
          answerId: 0,
          amount: amount,
          spent_token_root: sortedTokens[0].address,
        })
        .call()
        .then(r => r.value0);

      expect(
        new BigNumber(amount)
          .multipliedBy(poolsData.stablePool.feeParams.feeNumerator)
          .div(poolsData.stablePool.feeParams.denominator)
          .dp(0, BigNumber.ROUND_CEIL)
          .toString(),
      ).to.equal(
        new BigNumber(expected.beneficiary_fees[0])
          .plus(expected.pool_fees[0])
          .toString(),
        "Wrong total fee",
      );
    });
  });

  describe("Exchange", () => {
    it("DexPair exchange", async () => {
      const amount = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[0].address.toString()].decimals,
        )
        .toString();
      const expected = await expectedExchange(
        poolsData.pair.contract,
        amount,
        poolsData.pair.roots[0].address,
      );

      expect(
        new BigNumber(amount)
          .multipliedBy(poolsData.pair.feeParams.feeNumerator)
          .div(poolsData.pair.feeParams.denominator)
          .dp(0, BigNumber.ROUND_CEIL)
          .toString(),
      ).to.equal(
        new BigNumber(expected.beneficiaryFee)
          .plus(expected.poolFee)
          .toString(),
        "Wrong total fee",
      );
    });

    it("DexStablePair exchange", async () => {
      const amount = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[0].address.toString()].decimals,
        )
        .toString();
      const expected = await expectedExchange(
        poolsData.stablePair.contract,
        amount,
        poolsData.stablePair.roots[0].address,
      );

      expect(
        new BigNumber(amount)
          .multipliedBy(poolsData.stablePair.feeParams.feeNumerator)
          .div(poolsData.stablePair.feeParams.denominator)
          .dp(0, BigNumber.ROUND_CEIL)
          .toString(),
      ).to.equal(
        new BigNumber(expected.beneficiaryFee)
          .plus(expected.poolFee)
          .toString(),
        "Wrong total fee",
      );
    });

    it("DexStablePool exchange", async () => {
      const amount = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()].decimals,
        )
        .toString();
      const expected = await expectedExchange(
        poolsData.stablePool.contract,
        amount,
        poolsData.stablePool.roots[0].address,
        poolsData.stablePool.roots[1].address,
      );

      expect(
        new BigNumber(amount)
          .multipliedBy(poolsData.stablePool.feeParams.feeNumerator)
          .div(poolsData.stablePool.feeParams.denominator)
          .dp(0, BigNumber.ROUND_CEIL)
          .toString(),
      ).to.equal(
        new BigNumber(expected.beneficiaryFee)
          .plus(expected.poolFee)
          .toString(),
        "Wrong total fee",
      );
    });
  });
});
