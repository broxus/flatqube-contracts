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
  expectedExchange,
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
    }
  > = {
    stablePair: {
      contract: null,
      tokens: ["token-6-0", "token-9-0"],
      roots: [],
    },
    pair: {
      contract: null,
      tokens: ["token-9-0", "token-9-1"],
      roots: [],
    },
    stablePool: {
      contract: null,
      tokens: ["token-6-0", "token-9-0", "token-18-0"],
      roots: [],
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
    for (let tokenIndex of [0, 1]) {
      it(`Direct exchange Token${tokenIndex + 1} on Token${
        (tokenIndex ? 0 : 1) + 1
      } in DexPair`, async () => {
        const spentTokenRoot = poolsData.pair.roots[tokenIndex];
        const receivedTokenRoot = poolsData.pair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolExchangeGas();
        const poolDataStart = await getPoolData(poolsData.pair.contract);
        const amount = new BigNumber(1)
          .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
          .toString();

        const expectedExchangeData = await expectedExchange(
          poolsData.pair.contract,
          amount,
          spentTokenRoot.address,
        );
        const spentTokenWallet = await getWallet(
          owner.address,
          spentTokenRoot.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot.address,
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
          spentTokenWallet.methods
            .transfer({
              amount: amount,
              recipient: poolsData.pair.contract.address,
              deployWalletValue: 0,
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
            poolDataStart.balances[spentTokenRoot.address.toString()],
          )
            .plus(amount)
            .minus(expectedExchangeData.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[spentTokenRoot.address.toString()],
          `Pool has wrong spent token balance`,
        );
        expect(
          new BigNumber(
            poolDataStart.balances[receivedTokenRoot.address.toString()],
          )
            .minus(expectedExchangeData.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.address.toString()],
          `Pool has wrong received token balance`,
        );
        const accountSpentTokensChange =
          traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

        expect((-accountSpentTokensChange).toString()).to.equal(
          amount,
          `Account has wrong spent token balance`,
        );
        expect(accountReceivedTokensChange.toString()).to.equal(
          expectedExchangeData.receivedAmount,
          `Account has wrong received token balance`,
        );
      });
    }

    for (let tokenIndex of [0, 1]) {
      it(`Direct exchange Token${tokenIndex + 1} on Token${
        (tokenIndex ? 0 : 1) + 1
      } in DexStablePair`, async () => {
        const spentTokenRoot = poolsData.stablePair.roots[tokenIndex];
        const receivedTokenRoot =
          poolsData.stablePair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolExchangeGas();
        const poolDataStart = await getPoolData(poolsData.stablePair.contract);
        const amount = new BigNumber(1)
          .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
          .toString();

        const expectedExchangeData = await expectedExchange(
          poolsData.stablePair.contract,
          amount,
          spentTokenRoot.address,
        );
        const spentTokenWallet = await getWallet(
          owner.address,
          spentTokenRoot.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot.address,
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
          spentTokenWallet.methods
            .transfer({
              amount: amount,
              recipient: poolsData.stablePair.contract.address,
              deployWalletValue: 0,
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
            poolDataStart.balances[spentTokenRoot.address.toString()],
          )
            .plus(amount)
            .minus(expectedExchangeData.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[spentTokenRoot.address.toString()],
          `Pool has wrong spent token balance`,
        );
        expect(
          new BigNumber(
            poolDataStart.balances[receivedTokenRoot.address.toString()],
          )
            .minus(expectedExchangeData.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.address.toString()],
          `Pool has wrong received token balance`,
        );
        const accountSpentTokensChange =
          traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

        expect((-accountSpentTokensChange).toString()).to.equal(
          amount,
          `Account has wrong spent token balance`,
        );
        expect(accountReceivedTokensChange.toString()).to.equal(
          expectedExchangeData.receivedAmount,
          `Account has wrong received token balance`,
        );
      });
    }
  });
  describe("Direct exchange in pair v2", () => {
    for (let tokenIndex of [0, 1]) {
      it(`Direct exchange Token${tokenIndex + 1} on Token${
        (tokenIndex ? 0 : 1) + 1
      } in DexPair`, async () => {
        const spentTokenRoot = poolsData.pair.roots[tokenIndex];
        const receivedTokenRoot = poolsData.pair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolExchangeGas();
        const poolDataStart = await getPoolData(poolsData.pair.contract);
        const amount = new BigNumber(1)
          .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
          .toString();

        const expectedExchangeData = await expectedExchange(
          poolsData.pair.contract,
          amount,
          spentTokenRoot.address,
        );
        const spentTokenWallet = await getWallet(
          owner.address,
          spentTokenRoot.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot.address,
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
          spentTokenWallet.methods
            .transfer({
              amount: amount,
              recipient: poolsData.pair.contract.address,
              deployWalletValue: 0,
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
            poolDataStart.balances[spentTokenRoot.address.toString()],
          )
            .plus(amount)
            .minus(expectedExchangeData.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[spentTokenRoot.address.toString()],
          `Pool has wrong spent token balance`,
        );
        expect(
          new BigNumber(
            poolDataStart.balances[receivedTokenRoot.address.toString()],
          )
            .minus(expectedExchangeData.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.address.toString()],
          `Pool has wrong received token balance`,
        );
        const accountSpentTokensChange =
          traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

        expect((-accountSpentTokensChange).toString()).to.equal(
          amount,
          `Account has wrong spent token balance`,
        );

        expect(accountReceivedTokensChange.toString()).to.equal(
          expectedExchangeData.receivedAmount,
          `Account has wrong received token balance`,
        );
      });
    }

    for (let tokenIndex of [0, 1]) {
      it(`Direct exchange Token${tokenIndex + 1} on Token${
        (tokenIndex ? 0 : 1) + 1
      } in DexStablePair`, async () => {
        const spentTokenRoot = poolsData.stablePair.roots[tokenIndex];
        const receivedTokenRoot =
          poolsData.stablePair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolExchangeGas();
        const poolDataStart = await getPoolData(poolsData.stablePair.contract);
        const amount = new BigNumber(1)
          .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
          .toString();

        const expectedExchangeData = await expectedExchange(
          poolsData.stablePair.contract,
          amount,
          spentTokenRoot.address,
        );
        const spentTokenWallet = await getWallet(
          owner.address,
          spentTokenRoot.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot.address,
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
          spentTokenWallet.methods
            .transfer({
              amount: amount,
              recipient: poolsData.stablePair.contract.address,
              deployWalletValue: 0,
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
            poolDataStart.balances[spentTokenRoot.address.toString()],
          )
            .plus(amount)
            .minus(expectedExchangeData.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[spentTokenRoot.address.toString()],
          `Pool has wrong spent token balance`,
        );
        expect(
          new BigNumber(
            poolDataStart.balances[receivedTokenRoot.address.toString()],
          )
            .minus(expectedExchangeData.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.address.toString()],
          `Pool has wrong received token balance`,
        );
        const accountSpentTokensChange =
          traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

        expect((-accountSpentTokensChange).toString()).to.equal(
          amount,
          `Account has wrong spent token balance`,
        );

        expect(accountReceivedTokensChange.toString()).to.equal(
          expectedExchangeData.receivedAmount,
          `Account has wrong received token balance`,
        );
      });
    }

    it("Direct exchange in DexPair via expectedSpendAmount()", async () => {
      const spentTokenRoot = poolsData.pair.roots[1];
      const receivedTokenRoot = poolsData.pair.roots[0];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const expectedAmount = new BigNumber(1)
        .shiftedBy(tokensData[receivedTokenRoot.address.toString()].decimals)
        .toString();

      const expectedSpentData = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmount,
          receive_token_root: receivedTokenRoot.address,
          answerId: 0,
        })
        .call();

      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        commonAcc.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedAmount,
          _recipient: commonAcc.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        spentTokenWallet.methods
          .transfer({
            amount: expectedSpentData.expected_amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );
      expect(traceTree).to.emit("Exchange", poolsData.pair.contract).count(1);

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        new BigNumber(poolDataStart.balances[spentTokenRoot.address.toString()])
          .plus(expectedSpentData.expected_amount)
          .minus(
            await getFeesFromTotalFee(
              poolsData.pair.contract,
              expectedSpentData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect((-accountSpentTokensChange).toString()).to.equal(
        expectedSpentData.expected_amount,
        `Account has wrong spent token balance`,
      );
      expect(Number(accountReceivedTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmount),
        `Account has wrong received token balance`,
      );
    });

    it("Direct exchange in DexStablePair via expectedSpendAmount()", async () => {
      const spentTokenRoot = poolsData.stablePair.roots[1];
      const receivedTokenRoot = poolsData.stablePair.roots[0];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const expectedAmount = new BigNumber(1)
        .shiftedBy(tokensData[receivedTokenRoot.address.toString()].decimals)
        .toString();

      const expectedSpentData = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmount,
          receive_token_root: receivedTokenRoot.address,
          answerId: 0,
        })
        .call();

      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        commonAcc.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expectedAmount,
          _recipient: commonAcc.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        spentTokenWallet.methods
          .transfer({
            amount: expectedSpentData.expected_amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
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
        new BigNumber(poolDataStart.balances[spentTokenRoot.address.toString()])
          .plus(expectedSpentData.expected_amount)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePair.contract,
              expectedSpentData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect((-accountSpentTokensChange).toString()).to.equal(
        expectedSpentData.expected_amount,
        `Account has wrong spent token balance`,
      );
      expect(Number(accountReceivedTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmount),
        `Account has wrong received token balance`,
      );
    });

    it("Direct exchange in DexPair, expected_amount > received amount (revert)", async () => {
      const spentTokenRoot = poolsData.pair.roots[0];
      const receivedTokenRoot = poolsData.pair.roots[1];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.pair.contract);
      const amount = new BigNumber(1)
        .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.pair.contract,
        amount,
        spentTokenRoot.address,
      );
      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        owner.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expectedExchangeData.receivedAmount)
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
        spentTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.pair.contract);

      expect(
        poolDataStart.balances[spentTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        poolDataStart.balances[receivedTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[receivedTokenRoot.address.toString()],
        `Pool has wrong received token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect(accountSpentTokensChange).to.equal(
        "0",
        `Account has wrong spent token balance`,
      );
      expect(accountReceivedTokensChange).to.equal(
        "0",
        `Account has wrong received token balance`,
      );
    });

    it("Direct exchange in DexStablePair, expected_amount > received amount (revert)", async () => {
      const spentTokenRoot = poolsData.stablePair.roots[0];
      const receivedTokenRoot = poolsData.stablePair.roots[1];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const amount = new BigNumber(1)
        .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePair.contract,
        amount,
        spentTokenRoot.address,
      );
      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        owner.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildExchangePayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expectedExchangeData.receivedAmount)
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
        spentTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);

      expect(
        poolDataStart.balances[spentTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        poolDataStart.balances[receivedTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[receivedTokenRoot.address.toString()],
        `Pool has wrong received token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect(accountSpentTokensChange).to.equal(
        "0",
        `Account has wrong spent token balance`,
      );
      expect(accountReceivedTokensChange).to.equal(
        "0",
        `Account has wrong received token balance`,
      );
    });
  });

  describe("Direct exchange in stablePool", () => {
    const spentTokenIndex = 1;
    for (let receivedTokenIndex of [0, 2]) {
      it(`Direct exchange Token${spentTokenIndex + 1} on Token${
        receivedTokenIndex + 1
      } in DexStablePool`, async () => {
        const spentTokenRoot = poolsData.stablePool.roots[spentTokenIndex];
        const receivedTokenRoot =
          poolsData.stablePool.roots[receivedTokenIndex];

        const gas = await getPoolExchangeGas();
        const poolDataStart = await getPoolData(poolsData.stablePool.contract);
        const amount = new BigNumber(1)
          .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
          .toString();

        const expectedExchangeData = await expectedExchange(
          poolsData.stablePool.contract,
          amount,
          spentTokenRoot.address,
          receivedTokenRoot.address,
        );
        const spentTokenWallet = await getWallet(
          owner.address,
          spentTokenRoot.address,
        ).then(a => a.walletContract);

        const receivedTokenWallet = await getWallet(
          owner.address,
          receivedTokenRoot.address,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>
        ).methods
          .buildExchangePayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
            expected_amount: expectedExchangeData.receivedAmount,
            outcoming: receivedTokenRoot.address,
            recipient: zeroAddress,
            referrer: zeroAddress,
            cancel_payload: null,
            success_payload: null,
            toNative: false,
          })
          .call();

        const { traceTree } = await locklift.tracing.trace(
          spentTokenWallet.methods
            .transfer({
              amount: amount,
              recipient: poolsData.stablePool.contract.address,
              deployWalletValue: 0,
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
            poolDataStart.balances[spentTokenRoot.address.toString()],
          )
            .plus(amount)
            .minus(expectedExchangeData.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[spentTokenRoot.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[spentTokenIndex]} balance`,
        );
        expect(
          new BigNumber(
            poolDataStart.balances[receivedTokenRoot.address.toString()],
          )
            .minus(expectedExchangeData.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[receivedTokenRoot.address.toString()],
          `Pool has wrong spent balance`,
        );
        const accountSpentTokensChange =
          traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
        const accountReceivedTokensChange =
          traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

        expect((-accountSpentTokensChange).toString()).to.equal(
          amount,
          `Account has wrong spent token balance`,
        );
        expect(accountReceivedTokensChange.toString()).to.equal(
          expectedExchangeData.receivedAmount,
          `Account has wrong received token balance`,
        );
      });
    }

    it("Direct exchange in DexStablePool via expectedSpendAmount()", async () => {
      const spentTokenRoot = poolsData.stablePool.roots[1];
      const receivedTokenRoot = poolsData.stablePool.roots[0];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const expectedAmount = new BigNumber(1)
        .shiftedBy(tokensData[receivedTokenRoot.address.toString()].decimals)
        .toString();

      const expectedSpentData = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .expectedSpendAmount({
          receive_amount: expectedAmount,
          spent_token_root: spentTokenRoot.address,
          receive_token_root: receivedTokenRoot.address,
          answerId: 0,
        })
        .call();

      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        commonAcc.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: expectedAmount,
          outcoming: receivedTokenRoot.address,
          recipient: commonAcc.address,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        spentTokenWallet.methods
          .transfer({
            amount: expectedSpentData.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
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
        new BigNumber(poolDataStart.balances[spentTokenRoot.address.toString()])
          .plus(expectedSpentData.expected_amount)
          .minus(
            await getFeesFromTotalFee(
              poolsData.stablePool.contract,
              expectedSpentData.expected_fee,
              false,
            ).then(a => a.beneficiaryFee),
          )
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect((-accountSpentTokensChange).toString()).to.equal(
        expectedSpentData.expected_amount,
        `Account has wrong spent token balance`,
      );
      expect(Number(accountReceivedTokensChange)).to.be.greaterThanOrEqual(
        Number(expectedAmount),
        `Account has wrong received token balance`,
      );
    });

    it("Direct exchange in DexStablePool, expected_amount > received amount (revert)", async () => {
      const spentTokenRoot = poolsData.stablePool.roots[0];
      const receivedTokenRoot = poolsData.stablePool.roots[1];

      const gas = await getPoolExchangeGas();
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const amount = new BigNumber(1)
        .shiftedBy(tokensData[spentTokenRoot.address.toString()].decimals)
        .toString();

      const expectedExchangeData = await expectedExchange(
        poolsData.stablePool.contract,
        amount,
        spentTokenRoot.address,
        receivedTokenRoot.address,
      );
      const spentTokenWallet = await getWallet(
        owner.address,
        spentTokenRoot.address,
      ).then(a => a.walletContract);

      const receivedTokenWallet = await getWallet(
        owner.address,
        receivedTokenRoot.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildExchangePayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: new BigNumber(expectedExchangeData.receivedAmount)
            .plus(1)
            .toString(),
          outcoming: receivedTokenRoot.address,
          recipient: zeroAddress,
          referrer: zeroAddress,
          cancel_payload: null,
          success_payload: null,
          toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        spentTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      expect(
        poolDataStart.balances[spentTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[spentTokenRoot.address.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        poolDataStart.balances[receivedTokenRoot.address.toString()],
      ).to.equal(
        poolDataEnd.balances[receivedTokenRoot.address.toString()],
        `Pool has wrong received token balance`,
      );
      const accountSpentTokensChange =
        traceTree?.tokens.getTokenBalanceChange(spentTokenWallet);
      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect(accountSpentTokensChange).to.equal(
        "0",
        `Account has wrong spent token balance`,
      );
      expect(accountReceivedTokensChange).to.equal(
        "0",
        `Account has wrong received token balance`,
      );
    });
  });
});
