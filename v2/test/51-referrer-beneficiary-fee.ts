import { expect } from "chai";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
import { Constants } from "../../utils/consts";
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
  getFeesFromTotalFee,
  expectedExchange,
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
// let poolLpWallet: Contract<TokenWalletUpgradeableAbi>;
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

    poolsData.stablePool.lp = poolLpRoot;
    // poolLpWallet = lpWallet.walletContract;

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

    // for (let i = 0; i < N_COINS.length; i++) {
    //   feeParams.threshold[tokenRoots[i].address] = new BigNumber(2)
    //     .shiftedBy(tokens[i].decimals)
    //     .toString();
    // }

    // for (let i = 0; i < N_COINS.length; i++) {
    //     feeParams.referrer_threshold[tokenRoots[i].address] = new BigNumber(1).shiftedBy(tokens[i].decimals).toString();
    // }

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

    for (let i = 0; i < N_COINS.length; i++) {
      console.log(tokens[i].symbol + "Root: " + tokenRoots[i].address);
    }
    console.log(poolsData.stablePool + "LpRoot: " + poolLpRoot.address);

    console.log("DexAccount#2: " + DexAccount.address);
  });

  before("Set referral program params", async function () {
    const projectId = 22222;
    const projectAddress = Account1.address;
    const refSystemAddress = Account4.address;

    console.log(
      `Set referral program params:\n      -project_id: ${projectId}\n      -project_address: ${projectAddress}\n      -ref_system_address: ${refSystemAddress}`,
    );

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

      console.log("Set fee params checked ✅");
    });
  });

  // todo: stable pair test deposit
  describe("DexAccount deposit to STABLE POOl", function () {
    it("Add multiple coins imbalanced liquidity", async function () {
      console.log("#################################################");
      console.log("# Add multiple coins imbalanced liquidity");
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const operations = [];

      for (let i = 0; i < N_COINS.length; i++) {
        const amount = new BigNumber(i % 2 ? 10 : 90)
          .shiftedBy(N_COINS[i])
          .toString();
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

      console.log(expected, "expected");

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

      console.log("#################################################");
      console.log(`# Account#2 deposit ${tokens[TOKEN_NUM].symbol} liquidity`);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];
      const receivedTokenAddress = poolsData.stablePool.roots[1].address;

      console.log(poolDataStart, "poolDataStart");
      console.log(accountLpStart, "accountLpStart");
      console.log(receivedTokenAddress, "receivedTokenAddress");
      const operations = {
        root: tokenRoots[TOKEN_NUM].address,
        amount: (N_COINS[TOKEN_NUM] ** 10).toString(),
      };

      const expected = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        operations.amount,
        operations.root,
      );

      const LP_REWARD = expected.lpReward;
      const payload = await poolsData.stablePool.contract.methods
        .buildDepositLiquidityPayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: LP_REWARD,
          recipient: Account4.address,
          referrer: Account4.address,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      console.log(expected, "expected");

      await locklift.transactions.waitFinalized(
        await tokenWallets[TOKEN_NUM].methods
          .transfer({
            amount: operations.amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: Account4.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      // const accountLpEnd = (
      //   await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      // )[0];

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
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(expectedAccount2TokenBalances[i]).to.equal(
      //     poolDataEnd.balances[tokenRoots[i].address.toString()],
      //     `Wrong DexAccount#2 ${tokens[i].symbol}`,
      //   );
      // }
      // const expectedAccountTokenBalances = accountStart.token_balances;
      // expectedAccountTokenBalances[1] = new BigNumber(
      //   accountStart.token_balances[1],
      // )
      //   .minus(TOKENS_TO_DEPOSIT)
      //   .toString();
      //
      // let expectedAccountLp;
      // let expectedPoolTokenBalances = [];
      // let expectedPoolLp = new BigNumber(dexPoolInfoStart.lp_supply)
      //   .plus(LP_REWARD)
      //   .toString();
      // let expectedDexAccount3TokenBalances = [];
      // let expectedReferrerBalance = [];
      // if (options.pool_contract_name === "DexPair") {
      //   expectedAccountLp = new BigNumber(accountStart.lp)
      //     .plus(
      //       new BigNumber(expected.step_3_lp_reward).shiftedBy(
      //         -Constants.LP_DECIMALS,
      //       ),
      //     )
      //     .toString();
      //
      //   let expectedBeneficiary = new BigNumber(expected.step_2_spent)
      //     .shiftedBy(-tokens[1].decimals)
      //     .times(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .div(feeParams.denominator)
      //     .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
      //     .times(feeParams.beneficiary_numerator)
      //     .div(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);
      //
      //   console.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);
      //
      //   let expectedReferrer = new BigNumber(expected.step_2_spent)
      //     .shiftedBy(-tokens[1].decimals)
      //     .times(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .div(feeParams.denominator)
      //     .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
      //     .times(feeParams.referrer_numerator)
      //     .div(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);
      //
      //   console.log(`Referrer fee: ${expectedReferrer.toString()}`);
      //
      //   expectedPoolTokenBalances.push(
      //     new BigNumber(dexPoolInfoStart.token_balances[0])
      //       .plus(deposits[0])
      //       .toString(),
      //   );
      //   expectedPoolTokenBalances.push(
      //     new BigNumber(dexPoolInfoStart.token_balances[1])
      //       .plus(deposits[1])
      //       .minus(expectedBeneficiary)
      //       .minus(expectedReferrer)
      //       .toString(),
      //   );
      //
      //   for (let i = 0; i < N_COINS.length; i++) {
      //     expectedDexAccount3TokenBalances[i] = new BigNumber(
      //       i === 1 ? expectedBeneficiary : 0,
      //     )
      //       .plus(dexPoolInfoStart.token_fees[i])
      //       .plus(dexAccount3Start.accountBalances[i])
      //       .toString();
      //   }
      //
      //   expectedReferrerBalance = referrerStart.token_balances;
      //   expectedReferrerBalance[1] = expectedReferrer
      //     .plus(referrerStart.token_balances[1] || 0)
      //     .toString();
      // } else if (options.pool_contract_name === "DexStablePair") {
      //   expectedAccountLp = new BigNumber(accountStart.lp)
      //     .plus(LP_REWARD)
      //     .toString();
      //
      //   let fee_numerator = new BigNumber(feeParams.pool_numerator)
      //     .plus(feeParams.beneficiary_numerator)
      //     .plus(feeParams.referrer_numerator)
      //     .multipliedBy(options.roots.length)
      //     .dividedBy(4 * (options.roots.length - 1));
      //
      //   for (let i = 0; i < N_COINS.length; i++) {
      //     let expectedBeneficiary = new BigNumber(expected.differences[i])
      //       .shiftedBy(-tokens[i].decimals)
      //       .times(fee_numerator)
      //       .div(feeParams.denominator)
      //       .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
      //       .times(feeParams.beneficiary_numerator)
      //       .div(
      //         new BigNumber(feeParams.pool_numerator)
      //           .plus(feeParams.beneficiary_numerator)
      //           .plus(feeParams.referrer_numerator),
      //       )
      //       .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);
      //
      //     console.log(
      //       `Beneficiary fee ${
      //         tokens[i].symbol
      //       }: ${expectedBeneficiary.toString()}`,
      //     );
      //
      //     let expectedReferrer = new BigNumber(expected.differences[i])
      //       .shiftedBy(-tokens[i].decimals)
      //       .times(fee_numerator)
      //       .div(feeParams.denominator)
      //       .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
      //       .times(feeParams.referrer_numerator)
      //       .div(
      //         new BigNumber(feeParams.pool_numerator)
      //           .plus(feeParams.beneficiary_numerator)
      //           .plus(feeParams.referrer_numerator),
      //       )
      //       .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);
      //
      //     console.log(
      //       `Referrer fee ${tokens[i].symbol}: ${expectedReferrer.toString()}`,
      //     );
      //
      //     expectedPoolTokenBalances.push(
      //       new BigNumber(dexPoolInfoStart.token_balances[i])
      //         .plus(deposits[i])
      //         .minus(expectedBeneficiary)
      //         .minus(expectedReferrer)
      //         .toString(),
      //     );
      //
      //     expectedDexAccount3TokenBalances.push(
      //       expectedBeneficiary
      //         .plus(dexPoolInfoStart.token_fees[i])
      //         .plus(dexAccount3Start.accountBalances[i])
      //         .toString(),
      //     );
      //
      //     expectedReferrerBalance.push(
      //       expectedReferrer
      //         .plus(referrerStart.token_balances[i] || 0)
      //         .toString(),
      //     );
      //   }
      // } else if (options.pool_contract_name === "DexStablePool") {
      //   expectedAccountLp = new BigNumber(accountStart.lp)
      //     .plus(LP_REWARD)
      //     .toString();
      //
      //   let expectedBeneficiary = new BigNumber(amounts[1])
      //     .shiftedBy(-tokens[1].decimals)
      //     .times(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .div(feeParams.denominator)
      //     .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
      //     .times(feeParams.beneficiary_numerator)
      //     .div(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);
      //
      //   console.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);
      //
      //   let expectedReferrer = new BigNumber(amounts[1])
      //     .shiftedBy(-tokens[1].decimals)
      //     .times(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .div(feeParams.denominator)
      //     .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
      //     .times(feeParams.referrer_numerator)
      //     .div(
      //       new BigNumber(feeParams.pool_numerator)
      //         .plus(feeParams.beneficiary_numerator)
      //         .plus(feeParams.referrer_numerator),
      //     )
      //     .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);
      //
      //   console.log(`Referrer fee: ${expectedReferrer.toString()}`);
      //
      //   expectedPoolTokenBalances = dexPoolInfoStart.token_balances;
      //   expectedPoolTokenBalances[1] = new BigNumber(
      //     dexPoolInfoStart.token_balances[1],
      //   )
      //     .plus(deposits[1])
      //     .minus(expectedBeneficiary)
      //     .minus(expectedReferrer)
      //     .toString();
      //
      //   for (let i = 0; i < N_COINS.length; i++) {
      //     expectedDexAccount3TokenBalances[i] = new BigNumber(
      //       i === 1 ? expectedBeneficiary : 0,
      //     )
      //       .plus(dexPoolInfoStart.token_fees[i])
      //       .plus(dexAccount3Start.accountBalances[i])
      //       .toString();
      //   }
      //
      //   expectedReferrerBalance = referrerStart.token_balances;
      //   expectedReferrerBalance[1] = expectedReferrer
      //     .plus(referrerStart.token_balances[1] || 0)
      //     .toString();
      // }
      //
      // expect(dexPoolInfoEnd.lp_supply_actual).to.equal(
      //   dexPoolInfoEnd.lp_supply,
      //   "Wrong LP supply",
      // );
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(
      //     new BigNumber(accountEnd.token_balances[i]).toNumber(),
      //   ).to.approximately(
      //     new BigNumber(expectedAccountTokenBalances[i]).toNumber(),
      //     new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
      //     `Wrong Account#2 ${tokens[i].symbol} balance`,
      //   );
      // }
      // expect(accountEnd.lp.toString()).to.equal(
      //   expectedAccountLp,
      //   "Wrong Account#2 LP balance",
      // );
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(
      //     new BigNumber(expectedPoolTokenBalances[i]).toNumber(),
      //   ).to.approximately(
      //     new BigNumber(dexPoolInfoEnd.token_balances[i]).toNumber(),
      //     new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
      //     `Wrong DexPool ${tokens[i].symbol}`,
      //   );
      // }
      // expect(expectedPoolLp).to.equal(
      //   dexPoolInfoEnd.lp_supply,
      //   "Wrong DexPool LP supply",
      // );
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(
      //     new BigNumber(expectedDexAccount3TokenBalances[i]).toNumber(),
      //   ).to.approximately(
      //     new BigNumber(dexAccount3End.accountBalances[i])
      //       .plus(dexPoolInfoEnd.token_fees[i])
      //       .toNumber(),
      //     new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
      //     "Wrong beneficiary fee",
      //   );
      // }
      // for (let i = 0; i < N_COINS.length; i++) {
      //   expect(
      //     new BigNumber(expectedReferrerBalance[i]).toNumber(),
      //   ).to.approximately(
      //     new BigNumber(referrerEnd.token_balances[i]).toNumber(),
      //     new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
      //     "Wrong referrer fee",
      //   );
      // }
    });
  });

  describe("Direct exchanges", async function () {
    it(`Account#2 exchange Coin2 to Coin1`, async function () {
      const TOKEN_1 = 0;
      const TOKEN_2 = 1;
      console.log("#################################################");
      console.log(
        `# Account#2 exchange ${tokens[TOKEN_1].symbol} to ${tokens[TOKEN_2].symbol}`,
      );
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      const TOKENS_TO_EXCHANGE = 10;

      const expected = await expectedExchange(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        TOKENS_TO_EXCHANGE,
        poolsData.stablePool.roots[TOKEN_2].address,
        poolsData.stablePool.roots[TOKEN_1].address,
      );

      console.log(expected, "expected");
      const payload = await poolsData.stablePool.contract.methods
        .buildExchangePayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: expected.receivedAmount,
          outcoming: poolsData.stablePool.roots[TOKEN_1].address,
          recipient: DexOwner.address,
          referrer: DexOwner.address,
          success_payload: null,
          cancel_payload: null,
          toNative: false,
        })
        .call();

      await locklift.transactions.waitFinalized(
        await tokenWallets[TOKEN_2].methods
          .transfer({
            amount: TOKENS_TO_EXCHANGE * N_COINS[TOKEN_2] ** 10,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: Account4.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      console.log(poolDataStart, "poolDataStart");
      console.log(poolDataEnd, "poolDataEnd");

      console.log(accountLpStart, "accountLpStart");
      console.log(accountLpEnd, "accountLpEnd");

      // console.log(`Referrer fee: ${expectedReferrer.toString()}`);

      // const expectedReferrerBalanceSpent = expectedReferrer
      //   .plus(referrerStart.token_balances[1] || 0)
      //   .toString();
      // const expectedDexAccount3Spent = expectedBeneficiary
      //   .plus(dexPoolInfoStart.token_fees[1])
      //   .plus(dexAccount3Start.accountBalances[1])
      //   .toString();
      // const expectedDexReceived = new BigNumber(dexStart.token_balances[0])
      //   .minus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .toString();
      // const expectedDexSpent = new BigNumber(dexStart.token_balances[1])
      //   .plus(TOKENS_TO_EXCHANGE)
      //   .minus(expectedReferrer)
      //   .toString();
      // const expectedAccountReceived = new BigNumber(
      //   accountStart.token_balances[0],
      // )
      //   .plus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .toString();
      // const expectedAccountSpent = new BigNumber(accountStart.token_balances[1])
      //   .minus(TOKENS_TO_EXCHANGE)
      //   .toString();
      // const expectedPoolReceived = new BigNumber(
      //   dexPoolInfoStart.token_balances[0],
      // )
      //   .minus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .toString();
      // const expectedPoolSpent = new BigNumber(
      //   dexPoolInfoStart.token_balances[1],
      // )
      //   .plus(TOKENS_TO_EXCHANGE)
      //   .minus(expectedBeneficiary)
      //   .minus(expectedReferrer)
      //   .toString();
      //
      // expect(expectedDexReceived).to.equal(
      //   dexEnd.token_balances[0].toString(),
      //   `Wrong DEX ${tokens[0].symbol} balance`,
      // );
      // expect(expectedDexSpent).to.equal(
      //   dexEnd.token_balances[1].toString(),
      //   `Wrong DEX ${tokens[1].symbol} balance`,
      // );
      // expect(expectedAccountReceived).to.equal(
      //   accountEnd.token_balances[0].toString(),
      //   `Wrong Account#2 ${tokens[0].symbol} balance`,
      // );
      // expect(expectedAccountSpent).to.equal(
      //   accountEnd.token_balances[1].toString(),
      //   `Wrong Account#2 ${tokens[1].symbol} balance`,
      // );
      // expect(expectedPoolReceived).to.equal(
      //   dexPoolInfoEnd.token_balances[0].toString(),
      //   `Wrong DEXPool ${tokens[0].symbol} balance`,
      // );
      // expect(expectedPoolSpent).to.equal(
      //   dexPoolInfoEnd.token_balances[1].toString(),
      //   `Wrong DEXPool ${tokens[1].symbol} balance`,
      // );
      // expect(expectedDexAccount3Spent).to.equal(
      //   new BigNumber(dexAccount3End.accountBalances[1])
      //     .plus(dexPoolInfoEnd.token_fees[1])
      //     .toString(),
      //   "Wrong beneficiary fee",
      // );
      // expect(expectedReferrerBalanceSpent).to.equal(
      //   referrerEnd.token_balances[1],
      //   "Wrong referrer fee",
      // );
    });

    it("Account#2 exchange Coin1 to Coin2 (expectedSpendAmount)", async function () {
      console.log("#################################################");
      console.log(
        `# Account#2 exchange ${tokens[0].symbol} to ${tokens[1].symbol}`,
      );
      const TOKEN_1 = 0;
      const TOKEN_2 = 1;
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      const TOKENS_TO_RECEIVE = 100;

      const expected = await poolsData.stablePool.contract.methods
        .expectedSpendAmount({
          receive_amount: TOKENS_TO_RECEIVE * N_COINS[TOKEN_1] ** 10,
          receive_token_root: poolsData.stablePool.roots[TOKEN_2].address,
          spent_token_root: poolsData.stablePool.roots[TOKEN_1].address,
          answerId: 0,
        })
        .call();

      console.log(expected, "expected");
      // todo: for pair
      // expected = await DexPool.call({
      //   method: "expectedSpendAmount",
      //   params: {
      //     receive_amount: new BigNumber(TOKENS_TO_RECEIVE)
      //       .shiftedBy(tokens[1].decimals)
      //       .toString(),
      //     receive_token_root: tokenRoots[1].address,
      //   },
      // payload = await DexPool.call({
      //   method: "buildExchangePayloadV2",
      //   params: {
      //     _id: 0,
      //     _deployWalletGrams: locklift.utils.convertCrystal("0.2", "nano"),
      //     _expectedAmount: 0,
      //     _recipient: Account2.address,
      //     _referrer: Account2.address,
      //   },
      // });

      const payload = await poolsData.stablePool.contract.methods
        .buildExchangePayload({
          id: 0,
          deploy_wallet_grams: toNano(0.05),
          expected_amount: expected.expected_amount,
          outcoming: poolsData.stablePool.roots[TOKEN_1].address,
          recipient: DexOwner.address,
          referrer: DexOwner.address,
          success_payload: null,
          cancel_payload: null,
          toNative: false,
        })
        .call();

      await locklift.transactions.waitFinalized(
        await tokenWallets[TOKEN_1].methods
          .transfer({
            amount: expected.expected_amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: Account4.address,
            notify: true,
            payload: payload.value0,
          })
          .send({
            amount: toNano(3.3),
            from: DexOwner.address,
          }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      console.log(poolDataStart, "poolDataStart");
      console.log(poolDataEnd, "poolDataEnd");

      console.log(accountLpStart, "accountLpStart");
      console.log(accountLpEnd, "accountLpEnd");
      //
      // const expectedReferrerBalanceSpent = expectedReferrer
      //   .plus(referrerStart.token_balances[0] || 0)
      //   .toString();
      //
      // const expectedDexAccount3Spent = expectedBeneficiary
      //   .plus(dexPoolInfoStart.token_fees[0])
      //   .plus(dexAccount3Start.accountBalances[0])
      //   .toString();
      //
      // const expectedDexReceived = new BigNumber(dexStart.token_balances[1])
      //   .minus(TOKENS_TO_RECEIVE)
      //   .toString();
      // const expectedDexSpent = new BigNumber(dexStart.token_balances[0])
      //   .plus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .minus(expectedReferrer)
      //   .toString();
      // const expectedAccountReceived = new BigNumber(
      //   accountStart.token_balances[1],
      // )
      //   .plus(TOKENS_TO_RECEIVE)
      //   .toString();
      // const expectedAccountSpent = new BigNumber(accountStart.token_balances[0])
      //   .minus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .toString();
      // const expectedPoolSpent = new BigNumber(
      //   dexPoolInfoStart.token_balances[0],
      // )
      //   .plus(
      //     new BigNumber(expected.expected_amount).shiftedBy(
      //       -tokens[0].decimals,
      //     ),
      //   )
      //   .minus(expectedBeneficiary)
      //   .minus(expectedReferrer)
      //   .toString();
      // const expectedPoolReceived = new BigNumber(
      //   dexPoolInfoStart.token_balances[1],
      // )
      //   .minus(TOKENS_TO_RECEIVE)
      //   .toString();
      //
      // expect(expectedAccountSpent).to.equal(
      //   accountEnd.token_balances[0].toString(),
      //   `Wrong Account#2 ${tokens[0].symbol} balance`,
      // );
      // expect(expectedAccountReceived).to.equal(
      //   accountEnd.token_balances[1].toString(),
      //   `Wrong Account#2 ${tokens[1].symbol} balance`,
      // );
      // expect(new BigNumber(expectedPoolSpent).toNumber()).to.approximately(
      //   new BigNumber(dexPoolInfoEnd.token_balances[0]).toNumber(),
      //   new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
      //   `Wrong DEXPool ${tokens[0].symbol} balance`,
      // );
      // expect(expectedPoolReceived).to.equal(
      //   dexPoolInfoEnd.token_balances[1].toString(),
      //   `Wrong DEXPool ${tokens[1].symbol} balance`,
      // );
      // expect(expectedDexAccount3Spent).to.equal(
      //   new BigNumber(dexAccount3End.accountBalances[0])
      //     .plus(dexPoolInfoEnd.token_fees[0])
      //     .toString(),
      //   `Wrong DexAccount ${tokens[0].symbol} balance`,
      // );
      // expect(
      //   new BigNumber(expectedReferrerBalanceSpent).toNumber(),
      // ).to.approximately(
      //   new BigNumber(referrerEnd.token_balances[0]).toNumber(),
      //   new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
      //   "Wrong referrer fee",
      // );
      // expect(new BigNumber(expectedDexSpent).toNumber()).to.approximately(
      //   new BigNumber(dexEnd.token_balances[0]).toNumber(),
      //   new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
      //   `Wrong DEX ${tokens[0].symbol} balance`,
      // );
      // expect(new BigNumber(expectedDexReceived).toNumber()).to.approximately(
      //   new BigNumber(dexEnd.token_balances[1]).toNumber(),
      //   new BigNumber(1).shiftedBy(-tokens[1].decimals).toNumber(),
      //   `Wrong DEX ${tokens[1].symbol} balance`,
      // );
    });
  });

  describe("Withdraw beneficiary fee", async function () {
    it("Account#3 withdraw fee", async function () {
      console.log("#################################################");
      console.log("# DexPool.withdrawBeneficiaryFee");
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

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

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      console.log(poolDataStart, "poolDataStart");
      console.log(poolDataEnd, "poolDataEnd");

      console.log(accountLpStart, "accountLpStart");
      console.log(accountLpEnd, "accountLpEnd");

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
