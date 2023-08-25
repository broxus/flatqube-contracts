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
import { calcValue } from "../utils/gas.utils";
import { getPoolData, depositLiquidity } from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedDepositLiquidity,
  expectedDepositLiquidityOneCoin,
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
  //pooltype: 1 - dexpair, 2 - dexstablepair, 3 - stablePool
  //n - количество токенов в паре/пуле
  async function getPoolDepositGas(N: number, poolType: number) {
    return gasValues.methods
      .getPoolDirectDepositGas({
        N: N,
        referrer: zeroAddress,
        poolType: poolType,
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
  describe("Direct deposit to pair v1", () => {
    it("Deposit first token to DexStablePair", async () => {
      const gas = await getPoolDepositGas(2, 2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);

      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedDepositFirstData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          {
            root: poolsData.stablePair.roots[0].address,
            amount: amountFirstToken,
          },
          {
            root: poolsData.stablePair.roots[1].address,
            amount: "0",
          },
        ],
        false,
      );
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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: amountFirstToken,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .plus(amountFirstToken)
          .minus(
            expectedDepositFirstData.beneficiaryFees[
              poolsData.stablePair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-amountFirstToken).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");

      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositFirstData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexStablePair", async () => {
      const gas = await getPoolDepositGas(2, 2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);

      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedDepositSecondData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          {
            root: poolsData.stablePair.roots[0].address,
            amount: "0",
          },
          {
            root: poolsData.stablePair.roots[1].address,
            amount: amountSecondToken,
          },
        ],
        true,
      );

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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: amountSecondToken,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .plus(amountSecondToken)
          .minus(
            expectedDepositSecondData.beneficiaryFees[
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
        "0".toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositSecondData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit first token to DexPair", async () => {
      const gas = await getPoolDepositGas(2, 1);
      const poolDataStart = await getPoolData(poolsData.pair.contract);

      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[0].address.toString()].decimals - 3,
        )
        .toString();

      const expectedDepositFirstData = await expectedDepositLiquidity(
        poolsData.pair.contract,
        [
          {
            root: poolsData.pair.roots[0].address,
            amount: amountFirstToken,
          },
          {
            root: poolsData.pair.roots[1].address,
            amount: "0",
          },
        ],
        true,
      );
      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: amountFirstToken,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .plus(amountFirstToken)
          .minus(
            expectedDepositFirstData.beneficiaryFees[
              poolsData.pair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-amountFirstToken).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositFirstData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexPair", async () => {
      const gas = await getPoolDepositGas(2, 1);
      const poolDataStart = await getPoolData(poolsData.pair.contract);

      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[1].address.toString()].decimals - 3,
        )
        .toString();

      const expectedDepositSecondData = await expectedDepositLiquidity(
        poolsData.pair.contract,
        [
          {
            root: poolsData.pair.roots[0].address,
            amount: "0",
          },
          {
            root: poolsData.pair.roots[1].address,
            amount: amountSecondToken,
          },
        ],
        true,
      );
      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: amountSecondToken,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .plus(amountSecondToken)
          .minus(
            expectedDepositSecondData.beneficiaryFees[
              poolsData.pair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensNewChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensNewChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      expect(accountFirstAccountTokensNewChange.toString()).to.equal(
        "0".toString(),
      );
      expect(accountSecondAccountTokensNewChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositSecondData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
  describe("Direct deposit to pair v2", () => {
    it("Deposit first token to DexStablePair", async () => {
      const gas = await getPoolDepositGas(2, 2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);

      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedDepositFirstData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          {
            root: poolsData.stablePair.roots[0].address,
            amount: amountFirstToken,
          },
          {
            root: poolsData.stablePair.roots[1].address,
            amount: "0",
          },
        ],
        false,
      );
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
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedDepositFirstData.lpReward,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: amountFirstToken,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .plus(amountFirstToken)
          .minus(
            expectedDepositFirstData.beneficiaryFees[
              poolsData.stablePair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-amountFirstToken).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");

      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositFirstData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexStablePair", async () => {
      const gas = await getPoolDepositGas(2, 2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);

      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedDepositSecondData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          {
            root: poolsData.stablePair.roots[0].address,
            amount: "0",
          },
          {
            root: poolsData.stablePair.roots[1].address,
            amount: amountSecondToken,
          },
        ],
        true,
      );

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
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedDepositSecondData.lpReward,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: amountSecondToken,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .plus(amountSecondToken)
          .minus(
            expectedDepositSecondData.beneficiaryFees[
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
        "0".toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositSecondData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit first token to DexPair", async () => {
      const gas = await getPoolDepositGas(2, 1);
      const poolDataStart = await getPoolData(poolsData.pair.contract);

      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[0].address.toString()].decimals - 3,
        )
        .toString();

      const expectedDepositFirstData = await expectedDepositLiquidity(
        poolsData.pair.contract,
        [
          {
            root: poolsData.pair.roots[0].address,
            amount: amountFirstToken,
          },
          {
            root: poolsData.pair.roots[1].address,
            amount: "0",
          },
        ],
        true,
      );
      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedDepositFirstData.lpReward,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: amountFirstToken,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .plus(amountFirstToken)
          .minus(
            expectedDepositFirstData.beneficiaryFees[
              poolsData.pair.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-amountFirstToken).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositFirstData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexPair", async () => {
      const gas = await getPoolDepositGas(2, 1);
      const poolDataStart = await getPoolData(poolsData.pair.contract);

      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[1].address.toString()].decimals - 3,
        )
        .toString();

      const expectedDepositSecondData = await expectedDepositLiquidity(
        poolsData.pair.contract,
        [
          {
            root: poolsData.pair.roots[0].address,
            amount: "0",
          },
          {
            root: poolsData.pair.roots[1].address,
            amount: amountSecondToken,
          },
        ],
        true,
      );
      const firstTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[0].address,
      ).then(a => a.walletContract);

      const secondTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.roots[1].address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedDepositSecondData.lpReward,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: amountSecondToken,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.pair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .plus(amountSecondToken)
          .minus(
            expectedDepositSecondData.beneficiaryFees[
              poolsData.pair.roots[1].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensNewChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensNewChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      expect(accountFirstAccountTokensNewChange.toString()).to.equal(
        "0".toString(),
      );
      expect(accountSecondAccountTokensNewChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositSecondData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
  describe("Direct deposit to stable pool", () => {
    it("Deposit first token to DexStablePool via ExpectedDepositSpendAmount", async () => {
      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6);

      const expectedDepositFirstData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedDepositSpendAmount({
          lp_amount: lpAmount.toString(),
          spent_token_root: poolsData.stablePool.roots[0].address,
          answerId: 0,
        })
        .call();

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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: lpAmount.toString(),
          recipient: commonAcc.address,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: expectedDepositFirstData.tokens_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const lpTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(expectedDepositFirstData.tokens_amount)
          .minus(
            poolDataEnd.accumulatedFees[
              poolsData.stablePool.roots[0].address.toString()
            ],
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);
      const lpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-expectedDepositFirstData.tokens_amount).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(Number(lpTokensChange)).to.be.greaterThanOrEqual(Number(lpAmount));
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(lpTokensChange).toString(),
      ).to.be.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexStablePool via ExpectedDepositSpendAmount", async () => {
      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6);

      const expectedDepositSecondData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedDepositSpendAmount({
          lp_amount: lpAmount.toString(),
          spent_token_root: poolsData.stablePool.roots[1].address,
          answerId: 0,
        })
        .call();

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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: lpAmount.toString(),
          recipient: commonAcc.address,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: expectedDepositSecondData.tokens_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const lpTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(expectedDepositSecondData.tokens_amount)
          .minus(
            poolDataEnd.accumulatedFees[
              poolsData.stablePool.roots[1].address.toString()
            ],
          )
          .toString(),
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
      const lpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-expectedDepositSecondData.tokens_amount).toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(Number(lpTokensChange)).to.be.greaterThanOrEqual(Number(lpAmount));
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(lpTokensChange).toString(),
      ).to.be.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit third token to DexStablePool via ExpectedDepositSpendAmount", async () => {
      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(6);

      const expectedDepositThirdData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedDepositSpendAmount({
          lp_amount: lpAmount.toString(),
          spent_token_root: poolsData.stablePool.roots[2].address,
          answerId: 0,
        })
        .call();

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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: lpAmount.toString(),
          recipient: commonAcc.address,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        thirdTokenWallet.methods
          .transfer({
            amount: expectedDepositThirdData.tokens_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const lpTokenWallet = await getWallet(
        commonAcc.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(expectedDepositThirdData.tokens_amount)
          .minus(
            poolDataEnd.accumulatedFees[
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
      const lpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-expectedDepositThirdData.tokens_amount).toString(),
      );
      expect(Number(lpTokensChange)).to.be.greaterThanOrEqual(Number(lpAmount));
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(lpTokensChange).toString(),
      ).to.be.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit first token to DexStablePool", async () => {
      const gas = await getPoolDepositGas(3, 3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedDepositFirstData = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract,
        amountFirstToken.toString(),
        poolsData.stablePool.roots[0].address,
      );
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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedDepositFirstData.lpReward,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: amountFirstToken,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(amountFirstToken)
          .minus(expectedDepositFirstData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-amountFirstToken).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositFirstData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit second token to DexStablePool", async () => {
      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();
      const expectedDepositSecondData = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract,
        amountSecondToken.toString(),
        poolsData.stablePool.roots[1].address,
      );

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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedDepositSecondData.lpReward,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: amountSecondToken,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(amountSecondToken)
          .minus(expectedDepositSecondData.beneficiaryFee)
          .toString(),
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

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        "0".toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositSecondData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Deposit third token to DexStablePool", async () => {
      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const amountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedDepositThirdData = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract,
        amountThirdToken.toString(),
        poolsData.stablePool.roots[2].address,
      );
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
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedDepositThirdData.lpReward,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        thirdTokenWallet.methods
          .transfer({
            amount: amountThirdToken,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(amountThirdToken)
          .minus(expectedDepositThirdData.beneficiaryFee)

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
        "0".toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        "0".toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-amountThirdToken).toString(),
      );
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositThirdData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
});
