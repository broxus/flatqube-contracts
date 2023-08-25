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
import { expectedExchange } from "../../utils/expected.utils";
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
  describe("Direct exchange in pair v1", () => {
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
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
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
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
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
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
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .minus(expectedExchangeData.receivedAmount)
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
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
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .minus(expectedExchangeData.receivedAmount)
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
  describe("Direct exchange in pair v2", () => {
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
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        )
          .minus(expectedExchangeData.receivedAmount)
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
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        )
          .minus(expectedExchangeData.receivedAmount)
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
  describe("Direct exchange in stablePool", () => {
    it("Direct exchange first token on second token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountSecondToken,
          spent_token_root: poolsData.stablePool.roots[0].address,
          receive_token_root: poolsData.stablePool.roots[1].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[1].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
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

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
      );

      expect(Number(accountSecondAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountSecondToken),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange first token on third token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountThirdToken,
          spent_token_root: poolsData.stablePool.roots[0].address,
          receive_token_root: poolsData.stablePool.roots[2].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[2].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        firstTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
          .minus(
            poolDataEnd.accumulatedFees[
              poolsData.stablePool.roots[0].address.toString()
            ],
          )
          .plus(
            poolDataStart.accumulatedFees[
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

      expect(accountFirstAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(Number(accountThirdAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountThirdToken),
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
    it.skip("Direct exchange second token on first token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountFirstToken,
          spent_token_root: poolsData.stablePool.roots[1].address,
          receive_token_root: poolsData.stablePool.roots[0].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[0].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
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

      expect(Number(accountFirstAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountFirstToken),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange second token on third token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountThirdToken,
          spent_token_root: poolsData.stablePool.roots[1].address,
          receive_token_root: poolsData.stablePool.roots[2].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[2].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        secondTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
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

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
      );
      expect(Number(accountThirdAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountThirdToken),
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
    it.skip("Direct exchange third token on first token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountFirstToken,
          spent_token_root: poolsData.stablePool.roots[2].address,
          receive_token_root: poolsData.stablePool.roots[0].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[0].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        thirdTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
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

      expect(Number(accountFirstAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountFirstToken),
      );
      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
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
    it.skip("Direct exchange third token on second token in DexStablePool via expectedSpendAmount()", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmountSecondToken,
          spent_token_root: poolsData.stablePool.roots[2].address,
          receive_token_root: poolsData.stablePool.roots[1].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.expected_amount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[1].address,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        thirdTokenWallet.methods
          .transfer({
            amount: expectedExchangeData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(expectedExchangeData.expected_amount)
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

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");
      expect(Number(accountSecondAccountTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmountSecondToken),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-expectedExchangeData.expected_amount).toString(),
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
    it("Direct exchange first token on second token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountFirstToken,
        poolsData.stablePool.roots[0].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[1].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(amountFirstToken)
          .minus(expectedExchangeData.beneficiaryFee)
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
          .minus(expectedExchangeData.receivedAmount)
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
        (-amountFirstToken).toString(),
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedExchangeData.receivedAmount,
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange first token on third token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountFirstToken,
        poolsData.stablePool.roots[0].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[2].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .plus(amountFirstToken)
          .minus(expectedExchangeData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
        (-amountFirstToken).toString(),
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal(
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
    it("Direct exchange second token on first token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountSecondToken,
        poolsData.stablePool.roots[1].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[0].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(amountSecondToken)
          .minus(expectedExchangeData.beneficiaryFee)
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
        )
          .minus(expectedExchangeData.receivedAmount)
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
        expectedExchangeData.receivedAmount.toString(),
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        (-amountSecondToken).toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange second token on third token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountSecondToken,
        poolsData.stablePool.roots[1].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[2].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .plus(amountSecondToken)
          .minus(expectedExchangeData.beneficiaryFee)
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
          .minus(expectedExchangeData.receivedAmount)
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
        (-amountSecondToken).toString(),
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal(
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
    it("Direct exchange third token on first token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountThirdToken,
        poolsData.stablePool.roots[2].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[0].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(amountThirdToken)
          .minus(expectedExchangeData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[0].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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
        expectedExchangeData.receivedAmount,
      );

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-amountThirdToken).toString(),
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
    it("Direct exchange third token on second token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountThirdToken,
        poolsData.stablePool.roots[2].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedExchangeData.receivedAmount,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[1].address,
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
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[2].address.toString()
          ],
        )
          .plus(amountThirdToken)
          .minus(expectedExchangeData.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePool.roots[2].address.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[2]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePool.roots[1].address.toString()
          ],
        )
          .minus(expectedExchangeData.receivedAmount)
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

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal(
        expectedExchangeData.receivedAmount,
      );
      expect(accountThirdAccountTokensChange.toString()).to.equal(
        (-amountThirdToken).toString(),
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
  describe("Direct exchange V2 but expected_amount is too big", () => {
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
          _expectedAmount: BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
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

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[0].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[
            poolsData.stablePair.roots[1].address.toString()
          ],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.stablePair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[1]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");

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
          _expectedAmount: BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
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

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[1].address.toString()],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[1].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[1]} balance`,
      );
      expect(
        new BigNumber(
          poolDataStart.balances[poolsData.pair.roots[0].address.toString()],
        ).toString(),
      ).to.equal(
        poolDataEnd.balances[poolsData.pair.roots[0].address.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange first token on second token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountFirstToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[0].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountFirstToken,
        poolsData.stablePool.roots[0].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[1].address,
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
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange second token on third token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountSecondToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[1].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountSecondToken,
        poolsData.stablePool.roots[1].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[2].address,
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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

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

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
    it("Direct exchange third token on first token in DexStablePool", async () => {
      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amountThirdToken = new BigNumber(1)
        .shiftedBy(
          tokensData[poolsData.stablePool.roots[2].address.toString()]
            .decimals - 3,
        )
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amountThirdToken,
        poolsData.stablePool.roots[2].address,
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
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
          outcoming: poolsData.stablePool.roots[0].address,
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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

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
      const accountFirstAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(firstTokenWallet);
      const accountSecondAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(secondTokenWallet);
      const accountThirdAccountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(thirdTokenWallet);

      expect(accountFirstAccountTokensChange.toString()).to.equal("0");

      expect(accountSecondAccountTokensChange.toString()).to.equal("0");
      expect(accountThirdAccountTokensChange.toString()).to.equal("0");

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
});
