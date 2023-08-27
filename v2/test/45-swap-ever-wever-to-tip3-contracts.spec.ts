import { BigNumber } from "bignumber.js";
import { expect } from "chai";
import { Account } from "everscale-standalone-client/nodejs";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  EverToTip3Abi,
  EverWeverToTip3Abi,
  TestWeverVaultAbi,
  Tip3ToEverAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { depositLiquidity, getWallet } from "../../utils/wrappers";
import { expectedExchange } from "../../utils/expected.utils";
import { calcValue } from "../utils/gas.utils";

BigNumber.config({ EXPONENTIAL_AT: 257 });

const WEVER_DECIMALS = 9;
const TOKEN_DECIMALS = 6;

describe("Tests Swap Evers", () => {
  let owner: Account;

  let gasValues: Contract<DexGasValuesAbi>;

  let everToTip3: Contract<EverToTip3Abi>;
  let tip3ToEver: Contract<Tip3ToEverAbi>;
  let everWeverToTip3: Contract<EverWeverToTip3Abi>;
  let dexPair: Contract<DexPairAbi>;
  let wEverRoot: Contract<TokenRootUpgradeableAbi>;
  let tokenRoot: Contract<TokenRootUpgradeableAbi>;
  let wEverVault: Contract<TestWeverVaultAbi>;

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: [
        "dex-gas-values",
        "wever",
        "wrap-ever",
        "dex-accounts",
        "dex-pairs-wever",
      ],
    });

    owner = locklift.deployments.getAccount("DexOwner").account;

    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    everToTip3 = locklift.deployments.getContract<EverToTip3Abi>("EverToTip3");
    tip3ToEver = locklift.deployments.getContract<Tip3ToEverAbi>("Tip3ToEver");
    everWeverToTip3 =
      locklift.deployments.getContract<EverWeverToTip3Abi>("EverWeverToTip3");

    dexPair = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_wever_token-6-0",
    );
    wEverRoot =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>("weverRoot");
    tokenRoot =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-0");
    wEverVault =
      locklift.deployments.getContract<TestWeverVaultAbi>("weverVault");

    const dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
    await depositLiquidity(owner.address, dexAccount, dexPair, [
      {
        root: wEverRoot.address,
        amount: new BigNumber(100).shiftedBy(WEVER_DECIMALS).toString(),
      },
      {
        root: tokenRoot.address,
        amount: new BigNumber(100).shiftedBy(TOKEN_DECIMALS).toString(),
      },
    ]);
  });

  describe("Swap Ever to Tip3", () => {
    it(`Swap Ever to Tip3 - Success`, async () => {
      const gas = await gasValues.methods
        .getEverToTip3ExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const EVERS_TO_EXCHANGE = new BigNumber(20)
        .shiftedBy(WEVER_DECIMALS)
        .toString();
      const expected = await expectedExchange(
        dexPair,
        EVERS_TO_EXCHANGE,
        wEverRoot.address,
      );

      const payload = await everToTip3.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          pair: dexPair.address,
          expectedAmount: expected.receivedAmount,
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call()
        .then(r => r.value0);

      const { traceTree } = await locklift.tracing.trace(
        wEverVault.methods
          .wrap({
            tokens: EVERS_TO_EXCHANGE,
            owner_address: everToTip3.address,
            gas_back_address: owner.address,
            payload: payload,
          })
          .send({
            from: owner.address,
            amount: new BigNumber(calcValue(gas))
              .plus(EVERS_TO_EXCHANGE)
              .toString(),
          }),
      );

      const accountTokensChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, tokenRoot.address).then(
          wallet => wallet.walletContract.address,
        ),
      );
      expect(accountTokensChange).to.equal(
        expected.receivedAmount,
        "Wrong Account tokens balance",
      );
    });

    it(`Swap Ever to Tip3 - Cancel`, async () => {
      const gas = await gasValues.methods
        .getEverToTip3ExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const EVERS_TO_EXCHANGE = new BigNumber(20)
        .shiftedBy(WEVER_DECIMALS)
        .toString();
      const expected = await expectedExchange(
        dexPair,
        EVERS_TO_EXCHANGE,
        wEverRoot.address,
      );

      const payload = await everToTip3.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          pair: dexPair.address,
          expectedAmount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call()
        .then(r => r.value0);

      const { traceTree } = await locklift.tracing.trace(
        wEverVault.methods
          .wrap({
            tokens: EVERS_TO_EXCHANGE,
            owner_address: everToTip3.address,
            gas_back_address: owner.address,
            payload: payload,
          })
          .send({
            from: owner.address,
            amount: new BigNumber(calcValue(gas))
              .plus(EVERS_TO_EXCHANGE)
              .toString(),
          }),
      );

      const accountTokensChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, tokenRoot.address).then(
          wallet => wallet.walletContract.address,
        ),
      );
      const accountEversChange = traceTree.getBalanceDiff(owner.address);
      expect(accountTokensChange).to.equal("0", "Wrong Account tokens balance");
      expect(-Number(accountEversChange)).lt(
        Number(calcValue(gas)),
        "Wrong Account ever balance",
      );
    });
  });

  describe("Swap Tip3 to Ever", () => {
    it(`Swap Tip3 to Ever - Success`, async () => {
      const gas = await gasValues.methods
        .getTip3ToEverExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const TOKENS_TO_EXCHANGE = new BigNumber(20)
        .shiftedBy(TOKEN_DECIMALS)
        .toString();
      const expected = await expectedExchange(
        dexPair,
        TOKENS_TO_EXCHANGE,
        tokenRoot.address,
      );

      const payload = await tip3ToEver.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          pair: dexPair.address,
          expectedAmount: expected.receivedAmount,
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call();

      const tokenWallet = await getWallet(
        owner.address,
        tokenRoot.address,
      ).then(data => data.walletContract);

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: TOKENS_TO_EXCHANGE,
            recipient: tip3ToEver.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountEversChange = traceTree.getBalanceDiff(owner.address);

      expect(String(-accountTokensChange)).to.equal(
        TOKENS_TO_EXCHANGE,
        "Wrong Account tokens balance",
      );
      expect(Number(accountEversChange)).to.gt(
        new BigNumber(expected.receivedAmount).minus(calcValue(gas)).toNumber(),
        "Wrong Account ever balance",
      );
    });

    it(`Swap Tip3 to Ever - Cancel`, async () => {
      const gas = await gasValues.methods
        .getTip3ToEverExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const TOKENS_TO_EXCHANGE = new BigNumber(20)
        .shiftedBy(TOKEN_DECIMALS)
        .toString();
      const expected = await expectedExchange(
        dexPair,
        TOKENS_TO_EXCHANGE,
        tokenRoot.address,
      );

      const payload = await tip3ToEver.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          pair: dexPair.address,
          expectedAmount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call();

      const tokenWallet = await getWallet(
        owner.address,
        tokenRoot.address,
      ).then(data => data.walletContract);

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: TOKENS_TO_EXCHANGE,
            recipient: tip3ToEver.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountEversChange = traceTree.getBalanceDiff(owner.address);

      expect(String(accountTokensChange)).to.equal(
        "0",
        "Wrong Account tokens balance",
      );
      expect(-Number(accountEversChange)).to.lt(
        Number(calcValue(gas)),
        "Wrong Account ever balance",
      );
    });
  });

  describe("Swap Ever and Wever to Tip3", () => {
    it(`Swap Ever and Wever to Tip3 - Success`, async () => {
      const gas = await gasValues.methods
        .getEverWeverToTip3ExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const EVERS_TO_EXCHANGE = new BigNumber(5)
        .shiftedBy(WEVER_DECIMALS)
        .toString();
      const WEVERS_TO_EXCHANGE = new BigNumber(5)
        .shiftedBy(WEVER_DECIMALS)
        .toString();

      const expected = await expectedExchange(
        dexPair,
        new BigNumber(EVERS_TO_EXCHANGE).plus(WEVERS_TO_EXCHANGE).toString(),
        wEverRoot.address,
      );

      const payload = await everWeverToTip3.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          amount: new BigNumber(EVERS_TO_EXCHANGE)
            .plus(WEVERS_TO_EXCHANGE)
            .toString(),
          pair: dexPair.address,
          expectedAmount: expected.receivedAmount,
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const weverWallet = await getWallet(
        owner.address,
        wEverRoot.address,
      ).then(data => data.walletContract);

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: WEVERS_TO_EXCHANGE,
            recipient: everWeverToTip3.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload,
          })
          .send({
            from: owner.address,
            amount: new BigNumber(calcValue(gas))
              .plus(EVERS_TO_EXCHANGE)
              .toString(),
          }),
      );

      const accountTokensChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, tokenRoot.address).then(
          wallet => wallet.walletContract.address,
        ),
      );

      expect(accountTokensChange).to.equal(
        expected.receivedAmount,
        "Wrong Account tokens balance",
      );
    });

    it(`Swap Ever and Wever to Tip3 - Cancel`, async () => {
      const gas = await gasValues.methods
        .getEverWeverToTip3ExchangeGas({
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const EVERS_TO_EXCHANGE = new BigNumber(5)
        .shiftedBy(WEVER_DECIMALS)
        .toString();
      const WEVERS_TO_EXCHANGE = new BigNumber(5)
        .shiftedBy(WEVER_DECIMALS)
        .toString();

      const expected = await expectedExchange(
        dexPair,
        new BigNumber(EVERS_TO_EXCHANGE).plus(WEVERS_TO_EXCHANGE).toString(),
        wEverRoot.address,
      );

      const payload = await everWeverToTip3.methods
        .buildExchangePayload({
          id: getRandomNonce(),
          amount: new BigNumber(EVERS_TO_EXCHANGE)
            .plus(WEVERS_TO_EXCHANGE)
            .toString(),
          pair: dexPair.address,
          expectedAmount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          deployWalletValue: toNano(0.1),
          referrer: zeroAddress,
          outcoming: zeroAddress,
        })
        .call()
        .then(a => a.value0);

      const weverWallet = await getWallet(
        owner.address,
        wEverRoot.address,
      ).then(data => data.walletContract);

      const { traceTree } = await locklift.tracing.trace(
        weverWallet.methods
          .transfer({
            amount: WEVERS_TO_EXCHANGE,
            recipient: everWeverToTip3.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: payload,
          })
          .send({
            from: owner.address,
            amount: new BigNumber(calcValue(gas))
              .plus(EVERS_TO_EXCHANGE)
              .toString(),
          }),
      );

      const accountTokensChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, tokenRoot.address).then(
          wallet => wallet.walletContract.address,
        ),
      );
      const accountWeverChange = traceTree?.tokens.getTokenBalanceChange(
        weverWallet.address,
      );
      const accountEversChange = traceTree.getBalanceDiff(owner.address);

      expect(accountTokensChange).to.equal("0", "Wrong Account tokens balance");
      expect(accountWeverChange).to.equal(
        String(-WEVERS_TO_EXCHANGE),
        "Wrong Account wever balance",
      );
      expect(Number(accountEversChange)).to.gt(
        new BigNumber(EVERS_TO_EXCHANGE).minus(calcValue(gas)).toNumber(),
        "Wrong Account ever balance",
      );
    });
  });
});
