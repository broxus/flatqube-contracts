import { Account } from "everscale-standalone-client/nodejs";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { depositLiquidity, getWallet } from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import { expect } from "chai";
import { EMPTY_TVM_CELL } from "../../utils/consts";

describe("Check direct operations revert", () => {
  let owner: Account;
  let gasValues: Contract<DexGasValuesAbi>;
  let dexRoot: Contract<DexRootAbi>;

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

  async function setActive(roots: Address[], active: boolean) {
    await dexRoot.methods
      .setPoolActive({
        _param: { tokenRoots: roots, newActive: active },
        _remainingGasTo: owner.address,
      })
      .send({ from: owner.address, amount: toNano(2) });
  }

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-pairs", "dex-gas-values"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

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
  });

  describe("Direct deposit to pool with zero lp supply", () => {
    it(`Deposit to DexPair`, async () => {
      const tokenRoot = poolsData.pair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePair`, async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePool`, async () => {
      const tokenRoot = poolsData.stablePool.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: 0,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });
  });

  describe("Initial deposit to pools", () => {
    it(`Initial deposit to pools`, async () => {
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
  });

  describe("Deposit to non-active pools", () => {
    it(`Deposit to DexPair`, async () => {
      await setActive(poolsData.pair.roots, false);

      const tokenRoot = poolsData.pair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");

      await setActive(poolsData.pair.roots, true);
    });

    it(`Deposit to DexStablePair`, async () => {
      await setActive(poolsData.stablePair.roots, false);

      const tokenRoot = poolsData.stablePair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");

      await setActive(poolsData.stablePair.roots, true);
    });

    it(`Deposit to DexStablePool`, async () => {
      await setActive(poolsData.stablePool.roots, false);

      const tokenRoot = poolsData.stablePool.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: 0,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");

      await setActive(poolsData.stablePool.roots, true);
    });
  });

  describe("Transfer to pool with empty payload", () => {
    it(`Transfer to DexPair`, async () => {
      const tokenRoot = poolsData.pair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: EMPTY_TVM_CELL,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      expect(traceTree?.tokens.getTokenBalanceChange(tokenWallet)).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
    });

    it(`Transfer to DexStablePair`, async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: EMPTY_TVM_CELL,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      expect(traceTree?.tokens.getTokenBalanceChange(tokenWallet)).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
    });

    it(`Transfer to DexStablePool`, async () => {
      const tokenRoot = poolsData.stablePool.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: EMPTY_TVM_CELL,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      expect(traceTree?.tokens.getTokenBalanceChange(tokenWallet)).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
    });
  });

  describe("Invalid message sender", () => {
    it(`Deposit to DexPair`, async () => {
      const tokenRoot = poolsData.pair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        (poolsData.pair.contract as Contract<DexPairAbi>).methods
          .onAcceptTokensTransfer({
            _tokenRoot: tokenRoot,
            _tokensAmount: amount,
            _senderAddress: owner.address,
            _senderWallet: tokenWallet.address,
            _remainingGasTo: owner.address,
            _payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePair`, async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        (poolsData.stablePair.contract as Contract<DexStablePairAbi>).methods
          .onAcceptTokensTransfer({
            token_root: tokenRoot,
            tokens_amount: amount,
            sender_address: owner.address,
            sender_wallet: tokenWallet.address,
            original_gas_to: owner.address,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePool`, async () => {
      const tokenRoot = poolsData.stablePool.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: 0,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        (poolsData.stablePool.contract as Contract<DexStablePoolAbi>).methods
          .onAcceptTokensTransfer({
            token_root: tokenRoot,
            tokens_amount: amount,
            sender_address: owner.address,
            sender_wallet: tokenWallet.address,
            original_gas_to: owner.address,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });
  });

  describe("Wrong sender's token wallet", () => {
    it(`Deposit to DexPair`, async () => {
      const tokenRoot = poolsData.pair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.pair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePair`, async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePair.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: 0,
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });

    it(`Deposit to DexStablePool`, async () => {
      const tokenRoot = poolsData.stablePool.roots[0];

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );
      const lpTokenWallet = await getWallet(
        owner.address,
        poolsData.stablePool.lp.address,
      ).then(a => a.walletContract);

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: 0,
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        lpTokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      const accountTokensChange =
        traceTree?.tokens.getTokenBalanceChange(tokenWallet);
      const accountLpTokensChange =
        traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

      expect(accountTokensChange).to.equal(
        "0",
        `Account has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
      );
      expect(accountLpTokensChange).to.equal("0");
    });
  });
});
