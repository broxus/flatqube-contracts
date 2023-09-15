import { expect } from "chai";
import { Address, Contract, getRandomNonce, toNano } from "locklift";
import BigNumber from "bignumber.js";
import {
  depositLiquidity,
  getDexAccountData,
  getPoolData,
  getWallet,
  setReferralProgramParams,
  transferWrapper,
} from "../../utils/wrappers";
import {
  expectedDepositLiquidity,
  expectedExchange,
} from "../../utils/expected.utils";
import { Account } from "everscale-standalone-client";
import {
  DexAccountAbi,
  DexStablePairAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";

BigNumber.config({ EXPONENTIAL_AT: 257 });

let commonAcc1: Account; // ref system address
let owner: Account;

let dexAccount: Contract<DexAccountAbi>;

const poolData: {
  contract: Contract<DexStablePairAbi>;
  tokens: string[];
  roots: Address[];
  decimals: number[];
  lp: Address;
} = {
  contract: null,
  tokens: ["token-6-0", "token-9-0"],
  decimals: [6, 9],
  roots: [],
  lp: null,
};

describe(`Test beneficiary fee`, function () {
  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-stable"],
    });

    owner = locklift.deployments.getAccount("DexOwner").account;
    commonAcc1 = locklift.deployments.getAccount("commonAccount-1").account;

    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    poolData.contract = locklift.deployments.getContract<DexStablePairAbi>(
      "DexStablePair_" + poolData.tokens.join("_"),
    );

    poolData.roots = poolData.tokens.map(
      (token: string) =>
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(token)
          .address,
    );

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

    await setReferralProgramParams(
      22222,
      commonAcc1.address, // ref system
      locklift.deployments.getAccount("commonAccount-0").account.address, // project
    );
  });

  describe("Deposit multiple coins to DexStablePair", async function () {
    it("Add multiple coins imbalanced liquidity", async function () {
      const poolDataStart = await getPoolData(poolData.contract);

      const amounts = [3, 9].map((amount, i) =>
        new BigNumber(amount).shiftedBy(poolData.decimals[i]).toString(),
      );
      const operations = [
        { root: poolData.roots[0], amount: amounts[0] },
        { root: poolData.roots[1], amount: amounts[1] },
      ];

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        operations,
        true,
        commonAcc1.address,
      );

      await transferWrapper(owner.address, dexAccount.address, 0, operations);

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidityV2({
            _callId: getRandomNonce(),
            _operations: operations,
            _expected: {
              amount: expected.lpReward,
              root: poolData.lp,
            },
            _autoChange: true,
            _remainingGasTo: owner.address,
            _referrer: commonAcc1.address,
          })
          .send({
            amount: toNano(5),
            from: owner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolData.contract);

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, poolData.lp).then(a => a.walletContract),
      );
      expect(String(accountLpChange)).to.equal(expected.lpReward);

      // checking balance change for every token with fees
      for (const deposit of operations) {
        const root = deposit.root.toString();
        expect(
          new BigNumber(poolDataStart.balances[root])
            .plus(deposit.amount)
            .minus(expected.beneficiaryFees[root])
            .minus(expected.referrerFees[root])
            .toString(),
        ).to.equal(poolDataEnd.balances[root], `Pool has wrong balance`);
      }

      // checking fee to referrer from every token
      for (const [token, fee] of Object.entries(expected.referrerFees)) {
        const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
          await getWallet(commonAcc1.address, new Address(token)).then(
            a => a.walletContract,
          ),
        );

        expect(String(refAccountChange)).to.equal(
          String(fee),
          `Ref System has wrong balance`,
        );
      }
    });
  });

  describe("Direct deposit to DexStablePair", async function () {
    it("Direct deposit to DexStablePair", async function () {
      const tokenIndex = 1;
      const tokenRoot = poolData.roots[tokenIndex];
      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[tokenIndex])
        .toString();

      const poolDataStart = await getPoolData(poolData.contract);

      const expected = await expectedDepositLiquidity(
        poolData.contract,
        [
          {
            root: tokenRoot,
            amount: amount,
          },
          {
            root: poolData.roots[tokenIndex === 1 ? 0 : 1],
            amount: 0,
          },
        ],
        true,
        commonAcc1.address,
      );

      const payload = await poolData.contract.methods
        .buildDepositLiquidityPayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.lpReward,
          _recipient: owner.address,
          _referrer: commonAcc1.address,
          _successPayload: null,
          _cancelPayload: null,
        })
        .call();

      const tokenWallet = await getWallet(owner.address, tokenRoot).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        await tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolData.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: owner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolData.contract);

      // check LP balance of pool
      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, poolData.lp).then(a => a.walletContract),
      );
      expect(accountLpChange).to.equal(expected.lpReward);

      // check balance change with fees
      expect(
        new BigNumber(poolDataStart.balances[tokenRoot.toString()])
          .plus(amount)
          .minus(expected.beneficiaryFees[tokenRoot.toString()])
          .minus(expected.referrerFees[tokenRoot.toString()])
          .toString(),
      ).to.equal(
        poolDataEnd.balances[tokenRoot.toString()],
        `Pool has wrong deposit token balance`,
      );

      // check referrer account FEES
      const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(commonAcc1.address, tokenRoot).then(
          a => a.walletContract,
        ),
      );
      expect(refAccountChange).to.equal(
        expected.referrerFees[tokenRoot.toString()],
        `Ref System has wrong balance`,
      );
    });
  });

  describe("Direct exchange with DexStablePair", function () {
    const spentTokenIndex = 0;

    it(`Exchange Token1 --> Token2`, async function () {
      const spentToken = poolData.roots[spentTokenIndex];
      const receivedToken = poolData.roots[spentTokenIndex === 0 ? 1 : 0];

      const poolDataStart = await getPoolData(poolData.contract);
      const amount = new BigNumber(10)
        .shiftedBy(poolData.decimals[spentTokenIndex])
        .toString();

      const expected = await expectedExchange(
        poolData.contract,
        amount,
        spentToken,
        receivedToken,
        commonAcc1.address,
      );

      const payload = await poolData.contract.methods
        .buildExchangePayloadV2({
          _id: 0,
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: expected.receivedAmount,
          _recipient: owner.address,
          _referrer: commonAcc1.address,
          _successPayload: null,
          _cancelPayload: null,
          _toNative: false,
        })
        .call();

      const tokenWallet = await getWallet(owner.address, spentToken).then(
        a => a.walletContract,
      );

      const { traceTree } = await locklift.tracing.trace(
        await tokenWallet.methods
          .transfer({
            amount: amount,
            recipient: poolData.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: owner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolData.contract);

      expect(
        new BigNumber(poolDataStart.balances[spentToken.toString()])
          .plus(amount)
          .minus(expected.beneficiaryFee)
          .minus(expected.referrerFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentToken.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[receivedToken.toString()])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receivedToken.toString()],
        `Pool has wrong received token balance`,
      );

      // checking referrer fees!
      const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(commonAcc1.address, spentToken).then(
          a => a.walletContract,
        ),
      );

      expect(String(refAccountChange)).to.equal(
        expected.referrerFee,
        `Ref System has wrong balance`,
      );
    });
  });

  describe("Withdraw beneficiary fee", async function () {
    it("Withdraw beneficiary fee", async function () {
      // beneficiary address
      const commonAcc0 =
        locklift.deployments.getAccount("commonAccount-0").account;
      const dexAccount0 =
        locklift.deployments.getContract<DexAccountAbi>("commonDexAccount-0");

      const poolDataStart = await getPoolData(poolData.contract);
      const dexAccountStart = await getDexAccountData(
        poolData.roots,
        dexAccount0,
      );

      await poolData.contract.methods
        .withdrawBeneficiaryFee({
          send_gas_to: commonAcc0.address,
        })
        .send({
          from: commonAcc0.address,
          amount: toNano(1),
        });

      const poolDataEnd = await getPoolData(poolData.contract);
      const dexAccountEnd = await getDexAccountData(
        poolData.roots,
        dexAccount0,
      );

      poolData.roots.forEach((root, i) => {
        expect(poolDataEnd.accumulatedFees[root.toString()]).to.equal(
          "0",
          `Pool has wrong ${poolData.tokens[i]} accumulated fee`,
        );

        expect(
          new BigNumber(dexAccountStart[i])
            .plus(poolDataStart.accumulatedFees[root.toString()])
            .toString(),
        ).to.equal(
          dexAccountEnd[i],
          `Dex account has wrong ${poolData.tokens[i]} balance`,
        );
      });
    });
  });
});
