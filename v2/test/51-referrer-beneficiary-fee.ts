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
  getDexAccountData,
  getPoolData,
  getWallet,
  IFee,
  transferWrapper,
} from "../../utils/wrappers";
import { displayTx } from "../../utils/helpers";
import {
  expectedDepositLiquidity,
  expectedDepositLiquidityOneCoin,
  expectedExchange,
  expectedWithdrawLiquidityOneCoin,
} from "../../utils/expected.utils";
import { Account } from "everscale-standalone-client";
import {
  DexAccountAbi,
  DexRootAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  DexVaultAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from "../../build/factorySource";

BigNumber.config({ EXPONENTIAL_AT: 257 });

interface ITokenData {
  decimals: number;
  name: string;
  symbol: string;
  root: string;
  upgradeable: boolean;
}

let Account1: Account;
let Account4: Account;
let DexOwner: Account;

const feeParams: IFee = {
  denominator: 1000000,
  pool_numerator: 1000,
  beneficiary_numerator: 2000,
  referrer_numerator: 3000,
  beneficiary: zeroAddress,
  threshold: [],
  referrer_threshold: [],
};

const tokens: ITokenData[] = [];
const N_COINS = [6, 9, 18];

const tokenRoots: Contract<TokenRootUpgradeableAbi>[] = [];
const tokenWallets: Contract<TokenWalletUpgradeableAbi>[] = [];

let DexRoot: Contract<DexRootAbi>;
let poolLpRoot: Contract<TokenRootUpgradeableAbi>;
let DexAccount: Contract<DexAccountAbi>;
let DexVault: Contract<DexVaultAbi>;

type poolsType = "stablePool" | "stablePair";

const poolsData: Record<
  poolsType,
  {
    contract: Contract<DexStablePairAbi> | Contract<DexStablePoolAbi>;
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
  stablePool: {
    contract: null,
    tokens: ["token-6-0", "token-9-0", "token-18-0"],
    roots: [],
    lp: null,
  },
};

describe(`Test beneficiary fee`, function () {
  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: [
        "dex-gas-values",
        "wever",
        "wrap-ever",
        "dex-accounts",
        "dex-pairs",
        "dex-pairs-wever",
      ],
    });

    DexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    DexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
    DexOwner = locklift.deployments.getAccount("DexOwner").account;

    Account1 = locklift.deployments.getAccount("commonAccount-0").account;
    Account4 = locklift.deployments.getAccount("commonAccount-1").account;

    DexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    feeParams.beneficiary = Account1.address;

    poolsData.stablePair.contract =
      locklift.deployments.getContract<DexStablePairAbi>(
        "DexStablePair_" + poolsData.stablePair.tokens.join("_"),
      );
    poolsData.stablePool.contract =
      locklift.deployments.getContract<DexStablePoolAbi>(
        "DexStablePool_" + poolsData.stablePool.tokens.join("_"),
      );

    for (const pool in poolsData) {
      poolsData[pool as poolsType].roots = poolsData[
        pool as poolsType
      ].tokens.map((token: string) =>
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(token),
      );
    }

    for (let i = 0; i < N_COINS.length; i++) {
      tokenRoots.push(
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          `token-${N_COINS[i]}-0`,
        ),
      );
    }

    for (const pool in poolsData) {
      await depositLiquidity(
        DexOwner.address,
        DexAccount,
        poolsData[pool as poolsType].contract,
        poolsData[pool as poolsType].roots.map((root, i) => {
          return {
            root: root.address,
            amount: 10 * 10 ** N_COINS[i],
          };
        }),
      );
    }

    poolLpRoot = locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      (
        await poolsData.stablePool.contract.methods
          .getTokenRoots({ answerId: 0 })
          .call()
      ).lp,
    );

    // const lpWallet = await getWallet(DexOwner.address, poolLpRoot.address);

    // poolsData.stablePool.lp = poolLpRoot;
    // poolLpWallet = lpWallet.walletContract;

    // add pools to DexAccount + transfer to dexAccount
    for (const pool in poolsData) {
      await DexAccount.methods
        .addPool({
          _roots: poolsData[pool as poolsType].roots.map(
            (root: Contract<TokenRootUpgradeableAbi>) => root.address,
          ),
        })
        .send({
          from: DexOwner.address,
          amount: toNano(5),
        });

      poolsData[pool as poolsType].lp = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        await poolsData[pool as poolsType].contract.methods
          .getTokenRoots({ answerId: 0 })
          .call()
          .then(a => a.lp),
      );
    }

    for (let i = 0; i < N_COINS.length; i++) {
      const root = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${N_COINS[i]}-0`,
      );
      const token = {
        name: `token-${N_COINS[i]}-0`,
        symbol: `token-${N_COINS[i]}-0`,
        decimals: N_COINS[i],
        upgradeable: true,
        root: root.address.toString(),
      };
      tokens.push(token);
    }

    for (let i = 0; i < N_COINS.length; i++) {
      const walletForNewAcc = await tokenRoots[i].methods
        .walletOf({ walletOwner: DexOwner.address, answerId: 0 })
        .call();

      tokenWallets.push(
        locklift.factory.getDeployedContract(
          "TokenWalletUpgradeable",
          walletForNewAcc.value0,
        ),
      );
    }
  });

  before("Set referral program params", async function () {
    const projectId = 22222;
    const projectAddress = Account1.address;
    const refSystemAddress = Account4.address;

    const tx = await DexVault.methods
      .setReferralProgramParams({
        params: {
          projectId: projectId,
          projectAddress: projectAddress,
          systemAddress: refSystemAddress,
        },
      })
      .send({
        amount: toNano(1),
        from: DexOwner.address,
      });

    displayTx(tx);
  });

  describe("Configure fee params", function () {
    it("Set fee params", async function () {
      const roots = Object.values(tokenRoots).map(elem => elem.address);
      await DexRoot.methods
        .setPairFeeParams({
          _roots: roots,
          _params: feeParams,
          _remainingGasTo: DexOwner.address,
        })
        .send({
          from: DexOwner.address,
          amount: toNano(1.5),
        });

      const feeParamsEnd = (
        await poolsData.stablePool.contract.methods
          .getFeeParams({ answerId: 0 })
          .call()
      ).value0;

      expect(feeParamsEnd.beneficiary.toString()).to.equal(
        feeParams.beneficiary.toString(),
        "WRONG fee.beneficiary",
      );
      expect(feeParamsEnd.denominator).to.equal(
        feeParams.denominator.toString(),
        "WRONG fee.denominator",
      );
      expect(feeParamsEnd.pool_numerator).to.equal(
        feeParams.pool_numerator.toString(),
        "WRONG fee.pool_numerator",
      );
      expect(feeParamsEnd.beneficiary_numerator).to.equal(
        feeParams.beneficiary_numerator.toString(),
        "WRONG fee.beneficiary_numerator",
      );
      expect(feeParamsEnd.referrer_numerator).to.equal(
        feeParams.referrer_numerator.toString(),
        "WRONG fee.referrer_numerator",
      );
    });
  });

  // todo: stable pair test deposit
  describe("DexAccount deposit to STABLE POOl", function () {
    it("Add multiple coins imbalanced liquidity", async function () {
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const operations = [];

      // at least one coin should be different, or fees won't count
      for (let i = 0; i < N_COINS.length; i++) {
        const amountMult = i % 2 ? 5 : 9;
        const amount = (10 ** amountMult).toString();
        operations.push({
          amount: amount,
          root: tokenRoots[i].address,
        });
      }

      const expected = await expectedDepositLiquidity(
        poolsData.stablePool.contract,
        operations,
        true,
        true,
      );

      const LP_REWARD = expected.lpReward;

      await transferWrapper(
        DexOwner.address,
        DexAccount.address,
        0,
        operations,
      );

      const { traceTree } = await locklift.tracing.trace(
        DexAccount.methods
          .depositLiquidityV2({
            _callId: getRandomNonce(),
            _operations: operations,
            _expected: { amount: LP_REWARD, root: poolLpRoot.address },
            _autoChange: true,
            _remainingGasTo: DexOwner.address,
            _referrer: Account4.address,
          })
          .send({
            amount: toNano(5),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(DexOwner.address, poolsData.stablePool.lp.address).then(
          a => a.walletContract,
        ),
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
          await getWallet(Account4.address, new Address(token)).then(
            a => a.walletContract,
          ),
        );
        expect(String(refAccountChange)).to.equal(
          fee,
          `Ref System has wrong balance`,
        );
      }
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(LP_REWARD).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });
  });

  // todo: pair?
  describe("Direct deposit to poolsData.stablePool", async function () {
    it("DexOwner deposit Coin1 liquidity", async function () {
      const TOKEN_NUM = 1;
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const operations = {
        root: tokenRoots[TOKEN_NUM].address,
        amount: (10 ** N_COINS[TOKEN_NUM]).toString(),
      };
      const root = operations.root.toString();

      const expected = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        operations.amount,
        operations.root,
        true,
      );

      const LP_REWARD = expected.lpReward;
      const payload = await poolsData.stablePool.contract.methods
        .buildDepositLiquidityPayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: LP_REWARD,
          recipient: DexOwner.address,
          referrer: Account4.address,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        await tokenWallets[TOKEN_NUM].methods
          .transfer({
            amount: operations.amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: DexOwner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      // check balance change with fees
      expect(
        new BigNumber(poolDataStart.balances[root])
          .plus(operations.amount)
          .minus(expected.beneficiaryFee)
          .minus(expected.referrerFee)
          .toString(),
      ).to.equal(poolDataEnd.balances[root], `Pool has wrong balance`);

      // check total fees and supply of pool
      expect(poolDataStart.actualTotalSupply).to.equal(
        new BigNumber(poolDataEnd.actualTotalSupply)
          .minus(LP_REWARD)
          .toString(),
        "WRONG actualTotalSupply!",
      );

      expect(
        +poolDataStart.accumulatedFees[
          tokenRoots[TOKEN_NUM].address.toString()
        ],
      ).to.lessThanOrEqual(
        +poolDataEnd.accumulatedFees[tokenRoots[TOKEN_NUM].address.toString()],
        "Fees didnt change in pool",
      );

      // check referrer account FEES
      const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(Account4.address, operations.root).then(
          a => a.walletContract,
        ),
      );
      expect(String(refAccountChange)).to.equal(
        expected.referrerFee,
        `Ref System has wrong balance`,
      );

      // check LP balance of pool
      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(DexOwner.address, poolsData.stablePool.lp.address).then(
          a => a.walletContract,
        ),
      );
      expect(String(accountLpChange)).to.equal(expected.lpReward);
    });
  });

  describe("Direct exchanges stablePool-stablePair-pair", async function () {
    const TOKEN_1 = 0;
    const TOKEN_2 = 1;

    it(`exchange ${tokens[TOKEN_1].symbol} to ${tokens[TOKEN_2].symbol}`, async function () {
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const TOKENS_TO_EXCHANGE = 10 ** N_COINS[TOKEN_2];

      const expected = await expectedExchange(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        TOKENS_TO_EXCHANGE,
        poolsData.stablePool.roots[TOKEN_2].address,
        poolsData.stablePool.roots[TOKEN_1].address,
        true,
      );

      const payload = await poolsData.stablePool.contract.methods
        .buildExchangePayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: expected.receivedAmount,
          outcoming: poolsData.stablePool.roots[TOKEN_1].address,
          recipient: DexOwner.address,
          referrer: Account4.address,
          success_payload: null,
          cancel_payload: null,
          toNative: false,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        await tokenWallets[TOKEN_2].methods
          .transfer({
            amount: TOKENS_TO_EXCHANGE,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: DexOwner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      // checking balance change for both tokens
      const ROOT_1 = tokens[TOKEN_1].root.toString();
      const ROOT_2 = tokens[TOKEN_2].root.toString();

      expect(
        new BigNumber(poolDataStart.balances[ROOT_1])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[ROOT_1],
        `${tokens[TOKEN_1].symbol} has wrong balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[ROOT_2])
          .plus(TOKENS_TO_EXCHANGE)
          .minus(expected.beneficiaryFee)
          .minus(expected.referrerFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[ROOT_2],
        `${tokens[TOKEN_2].symbol} has wrong balance`,
      );

      // checking referrer fees!
      const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          Account4.address,
          new Address(tokens[TOKEN_2].root),
        ).then(a => a.walletContract),
      );

      expect(String(refAccountChange)).to.equal(
        expected.referrerFee,
        `Ref System has wrong balance`,
      );
    });
  });

  describe("Withdraw TOKEN with referrer", () => {
    it("Check DexStablePool withdraw liquidity one coin from STABLE POOL", async () => {
      const TOKEN_NUM = 0;
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const lpAmount = new BigNumber(1).shiftedBy(9).toString();
      const receivedTokenAddress =
        poolsData.stablePool.roots[TOKEN_NUM].address;

      const expected = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        lpAmount,
        receivedTokenAddress,
        true,
      );

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildWithdrawLiquidityOneCoinPayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: expected.receivedAmount,
          outcoming: poolsData.stablePool.roots[TOKEN_NUM].address,
          recipient: DexOwner.address,
          referrer: Account4.address,
          success_payload: null,
          cancel_payload: null,
          to_native: false,
        })
        .call();

      const lpWallet = await getWallet(
        DexOwner.address,
        poolsData.stablePool.lp.address,
      );
      console.log(poolsData.stablePool.lp.address, "poolsData.stablePool.lp");
      const { traceTree } = await locklift.tracing.trace(
        await lpWallet.walletContract.methods
          .transfer({
            amount: lpAmount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: DexOwner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );
      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

      // checking referrer fees
      const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(
          Account4.address,
          new Address(tokens[TOKEN_NUM].root),
        ).then(a => a.walletContract),
      );
      expect(String(refAccountChange)).to.equal(
        expected.referrerFee,
        `Ref System has wrong balance`,
      );

      // checking token balance change in pool
      expect(
        new BigNumber(poolDataStart.balances[receivedTokenAddress.toString()])
          .minus(expected.receivedAmount)
          .minus(expected.beneficiaryFee)
          .minus(expected.referrerFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receivedTokenAddress.toString()],
        `Pool has wrong received token balance`,
      );

      // checking fees change
      expect(
        new BigNumber(
          poolDataStart.accumulatedFees[receivedTokenAddress.toString()],
        )
          .plus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.accumulatedFees[receivedTokenAddress.toString()],
        `Pool has wrong received token fees`,
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });
  });

  describe("Withdraw beneficiary fee", async function () {
    it("Account#3 withdraw fee", async function () {
      // const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      // const accountLpStart = (
      //   await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      // )[0];

      await locklift.transactions.waitFinalized(
        await poolsData.stablePool.contract.methods
          .withdrawBeneficiaryFee({
            send_gas_to: Account4.address,
          })
          .send({
            from: DexOwner.address,
            amount: toNano(1),
          }),
      );

      // const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      // const accountLpEnd = (
      //   await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      // )[0];

      // console.log(poolDataStart, "poolDataStart");
      // console.log(poolDataEnd, "poolDataEnd");
      //
      // console.log(accountLpStart, "accountLpStart");
      // console.log(accountLpEnd, "accountLpEnd");

      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(dexPoolInfoEnd.token_fees[i]).to.equal(
      //     "0",
      //     `Wrong ${tokens[i].symbol} pool fee`,
      //   );
      // }
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(
      //     new BigNumber(dexAccount3Start.accountBalances[i])
      //       .plus(dexPoolInfoStart.token_fees[i])
      //       .toString(),
      //   ).to.equal(
      //     new BigNumber(dexAccount3End.accountBalances[i])
      //       .plus(dexPoolInfoEnd.token_fees[i])
      //       .toString(),
      //     `Wrong ${tokens[i].symbol} beneficiary fee`,
      //   );
      // }
    });
  });
});
