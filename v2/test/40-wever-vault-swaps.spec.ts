import { expect } from "chai";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
import BigNumber from "bignumber.js";
import {
  depositLiquidity,
  getExpectedTokenVaultAddress,
  getWallet,
  getWeverWallet,
  transferWrapper,
} from "../../utils/wrappers";
import {
  expectedDepositLiquidity,
  expectedExchange,
  expectedWithdrawLiquidity,
} from "../../utils/expected.utils";
import { Account } from "everscale-standalone-client";
import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../../utils/gas.utils";
import { Constants } from "../../utils/consts";

BigNumber.config({ EXPONENTIAL_AT: 257 });

describe(`Tests ever swaps`, function () {
  let owner: Account;
  let account1: Account;
  let gasValues: Contract<DexGasValuesAbi>;

  const poolData: {
    contract: Contract<DexPairAbi>;
    tokens: string[];
    roots: Address[];
    decimals: number[];
    lp: Address;
  } = {
    contract: null,
    tokens: ["token-wever", "token-6-0"],
    decimals: [9, 6],
    roots: [],
    lp: null,
  };

  const weverIndex = 0;
  let weverRoot: Address;

  async function getDepositGas() {
    return gasValues.methods
      .getPoolDirectDepositGas({
        N: 2,
        referrer: zeroAddress,
        poolType: 1,
        deployWalletValue: toNano(0.1),
      })
      .call()
      .then(a => a.value0);
  }

  async function getExchangeGas() {
    return gasValues.methods
      .getPoolDirectExchangeGas({
        referrer: zeroAddress,
        deployWalletValue: toNano(0.1),
      })
      .call()
      .then(a => a.value0);
  }

  async function getWithdrawGas() {
    return gasValues.methods
      .getPoolDirectWithdrawGas({
        numberOfCurrenciesToWithdraw: 2,
        referrer: zeroAddress,
        deployWalletValue: toNano(0.1),
      })
      .call()
      .then(a => a.value0);
  }

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-accounts", "wever", "dex-pairs-wever"],
    });
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    owner = locklift.deployments.getAccount("DexOwner").account;
    account1 = locklift.deployments.getAccount("commonAccount-1").account;

    let dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    poolData.contract = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_" + poolData.tokens.join("_"),
    );

    poolData.roots = poolData.tokens.map(
      (token: string) =>
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(token)
          .address,
    );
    weverRoot = poolData.roots[weverIndex];

    await depositLiquidity(
      owner.address,
      dexAccount,
      poolData.contract,
      poolData.roots.map((root, i) => {
        return {
          root: root,
          amount: new BigNumber(100).shiftedBy(poolData.decimals[i]).toString(),
        };
      }),
    );

    poolData.lp = await poolData.contract.methods
      .getTokenRoots({ answerId: 0 })
      .call()
      .then(a => a.lp);
  });

  describe("Ever to Tip3", async function () {
    it("Direct deposit to DexPair", async function () {
      const gas = await getDepositGas();

      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        [
          {
            root: weverRoot,
            amount: amount,
          },
          {
            root: poolData.roots[1],
            amount: 0,
          },
        ],
        true,
      );

      const payload = await poolData.contract.methods
        .buildDepositLiquidityPayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.lpReward,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
        })
        .call();

      const weverWallet = await getWeverWallet(poolData.contract.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        await weverWallet.methods
          .acceptNative({
            amount: amount,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(amount).plus(calcValue(gas, true)).toString(),
            from: owner.address,
          }),
      );

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, poolData.lp).then(a => a.walletContract),
      );
      expect(accountLpChange).to.equal(
        expected.lpReward,
        "Account has wrong LP balance",
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(amount, "Dex has wrong wever balance");
    });

    it(`Direct exchange in DexPair`, async function () {
      const gas = await getExchangeGas();

      const receivedToken = poolData.roots[weverIndex === 0 ? 1 : 0];

      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();

      const expected = await expectedExchange(
        poolData.contract,
        amount,
        weverRoot,
        receivedToken,
      );

      const receivedTokenWallet = await getWallet(
        owner.address,
        receivedToken,
      ).then(a => a.walletContract);

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.receivedAmount,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call();

      const tokenWallet = await getWeverWallet(poolData.contract.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .acceptNative({
            amount: amount,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(amount).plus(calcValue(gas, true)).toString(),
            from: owner.address,
          }),
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect(accountReceivedTokensChange.toString()).to.equal(
        expected.receivedAmount,
        `Account has wrong received token balance`,
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(amount, "Dex has wrong wever balance");
    });

    it("Direct deposit to DexPair, expected_amount > lp_amount (return wevers)", async function () {
      const gas = await getDepositGas();

      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        [
          {
            root: weverRoot,
            amount: amount,
          },
          {
            root: poolData.roots[1],
            amount: 0,
          },
        ],
        true,
      );

      const payload = await poolData.contract.methods
        .buildDepositLiquidityPayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.lpReward).plus(1).toString(),
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
        })
        .call();

      const weverWallet = await getWeverWallet(poolData.contract.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .acceptNative({
            amount: amount,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(amount).plus(calcValue(gas, true)).toString(),
            from: owner.address,
          }),
      );

      const accountWeversChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, weverRoot).then(a => a.walletContract),
      );
      expect(accountWeversChange).to.equal(
        amount,
        "Account has wrong wever balance",
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal("0", "Wrong Dex wever balance");
    });

    it(`Direct exchange in DexPair, expected_amount > received_amount (return wevers)`, async function () {
      const gas = await getExchangeGas();

      const receivedToken = poolData.roots[weverIndex === 0 ? 1 : 0];

      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();

      const expected = await expectedExchange(
        poolData.contract,
        amount,
        weverRoot,
        receivedToken,
      );

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call();

      const tokenWallet = await getWeverWallet(poolData.contract.address).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .acceptNative({
            amount: amount,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(amount).plus(calcValue(gas, true)).toString(),
            from: owner.address,
          }),
      );

      const accountWeversChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, weverRoot).then(a => a.walletContract),
      );
      expect(accountWeversChange).to.equal(
        amount,
        "Account has wrong wever balance",
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal("0", "Wrong Dex wever balance");
    });
  });

  describe("Ever + Wever to Tip3", async function () {
    it("Direct deposit to DexPair", async function () {
      const gas = await getDepositGas();

      const everAmount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const weverAmount = new BigNumber(5)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const totalAmount = new BigNumber(everAmount)
        .plus(weverAmount)
        .toString();

      await transferWrapper(owner.address, account1.address, toNano(0.1), [
        { root: weverRoot, amount: weverAmount },
      ]);

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        [
          {
            root: weverRoot,
            amount: totalAmount,
          },
          {
            root: poolData.roots[1],
            amount: 0,
          },
        ],
        true,
      );

      const weverWallet = await getWeverWallet(account1.address).then(
        a => a.walletContract,
      );

      const payload = await poolData.contract.methods
        .buildDepositLiquidityPayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.lpReward,
          _recipient: account1.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: totalAmount,
            recipient: poolData.contract.address,
            deployWalletValue: 0,
            remainingGasTo: account1.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(everAmount)
              .plus(calcValue(gas, true))
              .toString(),
            from: account1.address,
          }),
      );

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(account1.address, poolData.lp).then(
          a => a.walletContract,
        ),
      );
      expect(accountLpChange).to.equal(
        expected.lpReward,
        "Account has wrong LP balance",
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(
        totalAmount,
        "Dex has wrong wever balance",
      );
    });

    it(`Direct exchange in DexPair`, async function () {
      const gas = await getExchangeGas();

      const receivedToken = poolData.roots[weverIndex === 0 ? 1 : 0];

      const everAmount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const weverAmount = new BigNumber(5)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const totalAmount = new BigNumber(everAmount)
        .plus(weverAmount)
        .toString();

      await transferWrapper(owner.address, account1.address, toNano(0.1), [
        { root: weverRoot, amount: weverAmount },
      ]);

      const expected = await expectedExchange(
        poolData.contract,
        totalAmount,
        weverRoot,
        receivedToken,
      );

      const weverWallet = await getWeverWallet(account1.address).then(
        a => a.walletContract,
      );

      const receivedTokenWallet = await getWallet(
        account1.address,
        receivedToken,
      ).then(a => a.walletContract);

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.receivedAmount,
          _recipient: account1.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: totalAmount,
            deployWalletValue: 0,
            recipient: poolData.contract.address,
            remainingGasTo: account1.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(everAmount)
              .plus(calcValue(gas, true))
              .toString(),
            from: account1.address,
          }),
      );

      const accountReceivedTokensChange =
        traceTree?.tokens.getTokenBalanceChange(receivedTokenWallet);

      expect(accountReceivedTokensChange.toString()).to.equal(
        expected.receivedAmount,
        `Account has wrong received token balance`,
      );

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal(
        totalAmount,
        "Dex has wrong wever balance",
      );
    });

    it("Direct deposit to DexPair, expected_amount > lp_amount (return wevers)", async function () {
      const gas = await getDepositGas();

      const everAmount = new BigNumber(3)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const weverAmount = new BigNumber(7)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const totalAmount = new BigNumber(everAmount)
        .plus(weverAmount)
        .toString();

      await transferWrapper(owner.address, account1.address, toNano(0.1), [
        { root: weverRoot, amount: weverAmount },
      ]);

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        [
          {
            root: weverRoot,
            amount: totalAmount,
          },
          {
            root: poolData.roots[1],
            amount: 0,
          },
        ],
        true,
      );

      const weverWallet = await getWeverWallet(account1.address).then(
        a => a.walletContract,
      );

      const weverBalanceStart = await weverWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      const payload = await poolData.contract.methods
        .buildDepositLiquidityPayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.lpReward).plus(1).toString(),
          _recipient: account1.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: totalAmount,
            recipient: poolData.contract.address,
            deployWalletValue: 0,
            remainingGasTo: account1.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(everAmount)
              .plus(calcValue(gas, true))
              .toString(),
            from: account1.address,
          }),
      );

      const weverBalanceEnd = await weverWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      expect(
        new BigNumber(weverBalanceEnd).minus(weverBalanceStart).toString(),
      ).to.equal(everAmount, "Account has wrong wever balance");

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal("0", "Wrong Dex wever balance");
    });

    it(`Direct exchange in DexPair, expected_amount > received_amount (return wevers)`, async function () {
      const gas = await getExchangeGas();

      const receivedToken = poolData.roots[weverIndex === 0 ? 1 : 0];

      const everAmount = new BigNumber(6)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const weverAmount = new BigNumber(10)
        .shiftedBy(poolData.decimals[weverIndex])
        .toString();
      const totalAmount = new BigNumber(everAmount)
        .plus(weverAmount)
        .toString();

      const expected = await expectedExchange(
        poolData.contract,
        totalAmount,
        weverRoot,
        receivedToken,
      );

      const weverWallet = await getWeverWallet(account1.address).then(
        a => a.walletContract,
      );

      const weverBalanceStart = await weverWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          _recipient: account1.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: totalAmount,
            deployWalletValue: 0,
            recipient: poolData.contract.address,
            remainingGasTo: account1.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: new BigNumber(everAmount)
              .plus(calcValue(gas, true))
              .toString(),
            from: account1.address,
          }),
      );

      const weverBalanceEnd = await weverWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      expect(
        new BigNumber(weverBalanceEnd).minus(weverBalanceStart).toString(),
      ).to.equal(everAmount, "Account has wrong wever balance");

      const weverDexChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          await getExpectedTokenVaultAddress(weverRoot),
          weverRoot,
        ).then(a => a.walletContract),
      );
      expect(weverDexChange).to.equal("0", "Wrong Dex wever balance");
    });
  });

  describe("Tip3 to Ever", async function () {
    it("Direct withdrawal from DexPair", async function () {
      const gas = await getWithdrawGas();

      const lpAmount = new BigNumber(10)
        .shiftedBy(Constants.LP_DECIMALS)
        .toString();

      const expected = await expectedWithdrawLiquidity(
        poolData.contract,
        lpAmount,
      );

      const lpWallet = await getWallet(owner.address, poolData.lp).then(
        a => a.walletContract,
      );

      const payload = await poolData.contract.methods
        .buildWithdrawLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedLeftAmount: Object.values(expected.amounts)[0],
          _expectedRightAmount: Object.values(expected.amounts)[1],
          _recipient: zeroAddress,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
          _toNative: true,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpWallet.methods
          .transfer({
            amount: lpAmount,
            recipient: poolData.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const accountEversChange = traceTree.getBalanceDiff(owner.address);
      expect(Number(accountEversChange)).gt(
        new BigNumber(expected.amounts[weverRoot.toString()])
          .minus(calcValue(gas))
          .toNumber(),
        "Wrong Account ever balance",
      );
    });

    it(`Direct exchange in DexPair`, async function () {
      const gas = await getExchangeGas();

      const receivedIndex = weverIndex === 0 ? 1 : 0;
      const receivedToken = poolData.roots[receivedIndex];

      const amount = new BigNumber(8)
        .shiftedBy(poolData.decimals[receivedIndex])
        .toString();

      const expected = await expectedExchange(
        poolData.contract,
        amount,
        receivedToken,
        weverRoot,
      );

      const tokenWallet = await getWallet(owner.address, receivedToken).then(
        a => a.walletContract,
      );

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.receivedAmount,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: true,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            deployWalletValue: 0,
            recipient: poolData.contract.address,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: calcValue(gas, true),
            from: owner.address,
          }),
      );

      const accountEversChange = traceTree.getBalanceDiff(owner.address);
      expect(Number(accountEversChange)).gt(
        new BigNumber(expected.receivedAmount).minus(calcValue(gas)).toNumber(),
        "Wrong Account ever balance",
      );
    });
  });
});
