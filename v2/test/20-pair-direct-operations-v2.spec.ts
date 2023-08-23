import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexStablePairAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../utils/gas.utils";
import { getPoolData, depositLiquidity } from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedDepositLiquidity,
  expectedExchange,
  expectedWithdrawLiquidity,
} from "../../utils/expected.utils";
import { getWallet } from "../../utils/wrappers";

describe("Check DexAccount add Pair", () => {
  let owner: Account;
  let gasValues: Contract<DexGasValuesAbi>;

  const poolsData: Record<
    string,
    {
      contract: Contract<DexStablePairAbi> | Contract<DexPairAbi>;
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
  };

  const tokensData: Record<string, { decimals: number }> = {};
  //pooltype: 1 - dexpair, 2 - dexstablepair
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
  async function getPoolExchangeGas() {
    return gasValues.methods
      .getPoolDirectExchangeGas({
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
  describe("Direct exchange in pair", () => {
    it("Direct exchange first token on second token in DexStablePair", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePair.contract,
        amountFirstToken,
        poolsData.stablePair.roots[0].address,
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
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedExchangeData.receivedAmount,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
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
          .minus(expectedExchangeData.beneficiaryFee)
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

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedExchangeData.receivedAmount,
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange second token on first token in DexStablePair", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePair.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePair.contract,
        amountSecondToken,
        poolsData.stablePair.roots[1].address,
        poolsData.stablePair.roots[0].address,
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
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedExchangeData.receivedAmount,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
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
          .minus(expectedExchangeData.beneficiaryFee)
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
        expectedExchangeData.receivedAmount.toString(),
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange first token on second token in DexPair", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[0].address.toString()].decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.pair.contract,
        amountFirstToken,
        poolsData.pair.roots[0].address,
        poolsData.stablePair.roots[1].address,
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
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedExchangeData.receivedAmount,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
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
      expect(traceTree).to.emit("Exchange", poolsData.pair.contract).count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .plus(amountFirstToken)
          .minus(expectedExchangeData.beneficiaryFee)
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

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedExchangeData.receivedAmount,
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange second token on first token in DexPair", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.pair.roots[1].address.toString()].decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.pair.contract,
        amountSecondToken,
        poolsData.pair.roots[1].address,
        poolsData.stablePair.roots[0].address,
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
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedExchangeData.receivedAmount,
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
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
      expect(traceTree).to.emit("Exchange", poolsData.pair.contract).count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .plus(amountSecondToken)
          .minus(expectedExchangeData.beneficiaryFee)
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
        expectedExchangeData.receivedAmount.toString(),
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
  describe("Direct withdraw from pair", () => {
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
});
