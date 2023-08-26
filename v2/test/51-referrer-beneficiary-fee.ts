import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Constants } from "../../utils/consts";
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
} from "../../utils/expected.utils";
import BigNumber from "bignumber.js";
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
let poolLpWallet: Contract<TokenWalletUpgradeableAbi>;
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
    DexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    DexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
    DexOwner = locklift.deployments.getAccount("DexOwner").account;

    Account1 = locklift.deployments.getAccount("commonAccount-0").account;
    Account4 = locklift.deployments.getAccount("commonAccount-1").account;

    DexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    feeParams.beneficiary =
      locklift.deployments.getAccount("DexOwner").account.address;

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

    const lpWallet = await getWallet(DexOwner.address, poolLpRoot.address);

    poolsData.stablePool.lp = poolLpRoot;
    poolLpWallet = lpWallet.walletContract;

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
    const projectAddress = zeroAddress;
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
        from: Account1.address,
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
          _remainingGasTo: Account1.address,
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
    it("Add FOO+BAR liquidity (auto_change=true)", async function () {
      console.log("#################################################");
      console.log("# Add FOO+BAR liquidity (auto_change=true)");
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];
      const receivedTokenAddress = poolsData.stablePool.roots[0].address;

      const deposits = [];
      const amounts = [];
      const operations = [];

      for (let i = 0; i < N_COINS.length; i++) {
        deposits[i] = i % 2 ? 1000 : 9000;
        amounts[i] = 10 ** N_COINS[i];
        operations.push({
          amount: amounts[i],
          root: tokenRoots[i].address,
        });
      }

      const expected = await expectedDepositLiquidity(
        poolsData.stablePool.contract,
        operations,
        true,
      );

      const totalReceived = Object.values(expected.amounts)
        .reduce((acc, curr) => acc.plus(curr), new BigNumber(0))
        .toString();

      console.log(expected, "expected");

      const LP_REWARD = expected.lpReward;

      await transferWrapper(
        DexOwner.address,
        DexAccount.address,
        0,
        operations.concat([
          {
            root: poolsData.stablePool.lp.address,
            amount: +LP_REWARD,
          },
        ]),
      );

      const { traceTree } = await locklift.tracing.trace(
        await DexAccount.methods
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

      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      const expectedAccount2TokenBalances: string[] = [];
      const totalDepoStart = Object.values(poolDataStart.balances)
        .reduce((acc, curr) => acc.plus(curr), new BigNumber(0))
        .toString();
      const totalDepoEnd = Object.values(poolDataEnd.balances)
        .reduce((acc, curr) => acc.plus(curr), new BigNumber(0))
        .toString();

      for (let i = 0; i < N_COINS.length; i++) {
        expectedAccount2TokenBalances.push(
          new BigNumber(
            poolDataStart.balances[tokenRoots[i].address.toString()],
          )
            .plus(amounts[i])
            .toString(),
        );
      }
      //
      // for (let i = 0; i < N_COINS.length; i++) {
      //   const expectedBeneficiary = expected.beneficiaryFees;
      //
      //   const expectedReferrer = expected.referrerFees;
      //
      //   expectedPoolTokenBalances.push(
      //     new BigNumber(dexPoolInfoStart.token_balances[i])
      //       .plus(deposits[i])
      //       .minus(expectedBeneficiary[tokens[i].root])
      //       .minus(expectedReferrer[tokens[i].root])
      //       .toString(),
      //   );
      //
      //   expectedDexAccount3TokenBalances.push(
      //     new BigNumber(expectedBeneficiary[tokens[i].root])
      //       .plus(dexPoolInfoStart.token_fees[i])
      //       .plus(dexAccount3Start.accountBalances[i])
      //       .toString(),
      //   );
      // }

      // expect(dexPoolInfoEnd.lp_supply_actual).to.equal(
      //   dexPoolInfoEnd.lp_supply,
      //   "Wrong LP supply",
      // );
      for (let i = 0; i < N_COINS.length; i++) {
        expect(expectedAccount2TokenBalances[i]).to.equal(
          poolDataEnd.balances[tokenRoots[i].address.toString()],
          `Wrong DexAccount#2 ${tokens[i].symbol}`,
        );
      }
      expect(new BigNumber(accountLpStart).plus(LP_REWARD).toString()).to.equal(
        accountLpEnd,
        `Account has wrong LP balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[receivedTokenAddress.toString()])
          .plus(expected.amounts[receivedTokenAddress.toString()])
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receivedTokenAddress.toString()],
        `Pool has wrong received token balance`,
      );
      expect(
        new BigNumber(totalDepoStart).plus(totalReceived).toString(),
      ).to.equal(totalDepoEnd, `Account has wrong received token balance`);
      expect(
        new BigNumber(
          poolDataStart.accumulatedFees[receivedTokenAddress.toString()],
        )
          .plus(expected.beneficiaryFees[tokens[0].root])
          .toString(),
      ).to.equal(
        poolDataEnd.accumulatedFees[receivedTokenAddress.toString()],
        `Pool has wrong received token fees`,
      );
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(LP_REWARD).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });
  });

  // todo: pair?
  describe("Direct deposit to poolsData.stablePool", async function () {
    it("DexOwner deposit Coin1 liquidity", async function () {
      console.log("#################################################");
      console.log(`# Account#2 deposit ${tokens[1].symbol} liquidity`);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];
      const receivedTokenAddress = poolsData.stablePool.roots[1].address;

      console.log(poolDataStart, "poolDataStart");
      console.log(accountLpStart, "accountLpStart");
      console.log(receivedTokenAddress, "receivedTokenAddress");
      const operations = {
        root: tokenRoots[1].address,
        amount: (N_COINS[1] ** 10).toString(),
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
          expected_amount: expected.lpReward,
          recipient: Account4.address,
          referrer: Account4.address,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      console.log(expected, "expected");

      await tokenWallets[1].methods
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
        });

      // await Account2.runTarget({
      //   contract: tokenWallets2[1],
      //   method: "transfer",
      //   params: {
      //     amount: new BigNumber(TOKENS_TO_DEPOSIT)
      //       .shiftedBy(tokens[1].decimals)
      //       .toString(),
      //     recipient: DexPool.address,
      //     deployWalletValue: 0,
      //     remainingGasTo: Account2.address,
      //     notify: true,
      //     payload: payload,
      //   },
      //   value: locklift.utils.convertCrystal("3.3", "nano"),
      //   keyPair: keyPairs[1],
      // });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], DexAccount)
      )[0];

      console.log(poolDataEnd, "poolDataEnd");
      console.log(accountLpEnd, "accountLpEnd");

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

  // describe("Direct exchanges", async function () {
  //   it(`Account#2 exchange Coin2 to Coin1`, async function () {
  //     console.log("#################################################");
  //     console.log(
  //       `# Account#2 exchange ${tokens[1].symbol} to ${tokens[0].symbol}`,
  //     );
  //     const dexStart = await dexBalances();
  //     const dexAccount3Start = await dexAccountBalances(DexAccount3);
  //     const accountStart = await account2balances();
  //     const dexPoolInfoStart = await dexPoolInfo();
  //     const referrerStart = await account4balances();
  //
  //     console.log(
  //       `Account#2 balance start: ` +
  //         `${
  //           accountStart.token_balances[0] !== undefined
  //             ? accountStart.token_balances[0] + ` ${tokens[0].symbol}`
  //             : `${tokens[0].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountStart.token_balances[1] !== undefined
  //             ? accountStart.token_balances[1] + ` ${tokens[1].symbol}`
  //             : `${tokens[1].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountStart.lp !== undefined
  //             ? accountStart.lp + " LP"
  //             : "LP (not deployed)"
  //         }`,
  //     );
  //     console.log(
  //       `DexAccount#3 balance start: ` +
  //         `${dexAccount3Start.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3Start.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`,
  //     );
  //     console.log(
  //       `DexPool start: ` +
  //         `${dexPoolInfoStart.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoStart.token_balances[1]} ${tokens[1].symbol}, ` +
  //         `${dexPoolInfoStart.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoStart.token_fees[1]} ${tokens[1].symbol} FEE, ` +
  //         `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
  //         `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`,
  //     );
  //     console.log(
  //       `DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`,
  //     );
  //     let logs = `Account#4 balance start: `;
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
  //     }
  //     console.log(logs);
  //
  //     const TOKENS_TO_EXCHANGE = 100;
  //
  //     let expected;
  //     if (options.roots.length === 2) {
  //       expected = await DexPool.call({
  //         method: "expectedExchange",
  //         params: {
  //           amount: new BigNumber(TOKENS_TO_EXCHANGE)
  //             .shiftedBy(tokens[1].decimals)
  //             .toString(),
  //           spent_token_root: tokenRoots[1].address,
  //         },
  //       });
  //     } else {
  //       expected = await DexPool.call({
  //         method: "expectedExchange",
  //         params: {
  //           amount: new BigNumber(TOKENS_TO_EXCHANGE)
  //             .shiftedBy(tokens[1].decimals)
  //             .toString(),
  //           spent_token_root: tokenRoots[1].address,
  //           receive_token_root: tokenRoots[0].address,
  //         },
  //       });
  //     }
  //
  //     console.log(
  //       `Spent amount: ${TOKENS_TO_EXCHANGE.toString()} ${tokens[1].symbol}`,
  //     );
  //     console.log(
  //       `Expected fee: ${new BigNumber(expected.expected_fee)
  //         .shiftedBy(-tokens[1].decimals)
  //         .toString()} ${tokens[1].symbol}`,
  //     );
  //     console.log(
  //       `Expected receive amount: ${new BigNumber(expected.expected_amount)
  //         .shiftedBy(-tokens[0].decimals)
  //         .toString()} ${tokens[0].symbol}`,
  //     );
  //
  //     let payload;
  //     if (options.roots.length === 2) {
  //       payload = await DexPool.call({
  //         method: "buildExchangePayloadV2",
  //         params: {
  //           _id: 0,
  //           _deployWalletGrams: locklift.utils.convertCrystal("0.05", "nano"),
  //           _expectedAmount: expected.expected_amount,
  //           _recipient: Account2.address,
  //           _referrer: Account2.address,
  //         },
  //       });
  //     } else {
  //       payload = await DexPool.call({
  //         method: "buildExchangePayload",
  //         params: {
  //           id: 0,
  //           deploy_wallet_grams: locklift.utils.convertCrystal("0.05", "nano"),
  //           expected_amount: expected.expected_amount,
  //           outcoming: tokenRoots[0].address,
  //           recipient: Account2.address,
  //           referrer: Account2.address,
  //         },
  //       });
  //     }
  //
  //     tx = await Account2.runTarget({
  //       contract: tokenWallets2[1],
  //       method: "transfer",
  //       params: {
  //         amount: new BigNumber(TOKENS_TO_EXCHANGE)
  //           .shiftedBy(tokens[1].decimals)
  //           .toString(),
  //         recipient: DexPool.address,
  //         deployWalletValue: 0,
  //         remainingGasTo: Account2.address,
  //         notify: true,
  //         payload: payload,
  //       },
  //       value: locklift.utils.convertCrystal("3.3", "nano"),
  //       keyPair: keyPairs[1],
  //     });
  //
  //     displayTx(tx);
  //
  //     const dexEnd = await dexBalances();
  //     const dexAccount3End = await dexAccountBalances(DexAccount3);
  //     const accountEnd = await account2balances();
  //     const dexPoolInfoEnd = await dexPoolInfo();
  //     const referrerEnd = await account4balances();
  //
  //     console.log(
  //       `Account#2 balance end: ` +
  //         `${
  //           accountEnd.token_balances[0] !== undefined
  //             ? accountEnd.token_balances[0] + ` ${tokens[0].symbol}`
  //             : `${tokens[0].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountEnd.token_balances[1] !== undefined
  //             ? accountEnd.token_balances[1] + ` ${tokens[1].symbol}`
  //             : `${tokens[1].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountEnd.lp !== undefined
  //             ? accountEnd.lp + " LP"
  //             : "LP (not deployed)"
  //         }`,
  //     );
  //     console.log(
  //       `DexAccount#3 balance end: ` +
  //         `${dexAccount3End.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3End.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3End.lp} LP`,
  //     );
  //     console.log(
  //       `DexPool end: ` +
  //         `${dexPoolInfoEnd.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoEnd.token_balances[1]} ${tokens[1].symbol}, ` +
  //         `${dexPoolInfoEnd.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoEnd.token_fees[1]} ${tokens[1].symbol} FEE, ` +
  //         `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
  //         `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`,
  //     );
  //     console.log(
  //       `DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`,
  //     );
  //     logs = `Account#4 balance end: `;
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
  //     }
  //     console.log(logs);
  //
  //     await migration.logGas();
  //
  //     let expectedBeneficiary = new BigNumber(TOKENS_TO_EXCHANGE)
  //       .shiftedBy(tokens[1].decimals)
  //       .times(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .div(feeParams.denominator)
  //       .dp(0, BigNumber.ROUND_CEIL)
  //       .times(feeParams.beneficiary_numerator)
  //       .div(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .dp(0, BigNumber.ROUND_FLOOR)
  //       .shiftedBy(-tokens[1].decimals);
  //
  //     console.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);
  //
  //     let expectedReferrer = new BigNumber(TOKENS_TO_EXCHANGE)
  //       .shiftedBy(tokens[1].decimals)
  //       .times(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .div(feeParams.denominator)
  //       .dp(0, BigNumber.ROUND_CEIL)
  //       .times(feeParams.referrer_numerator)
  //       .div(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .dp(0, BigNumber.ROUND_FLOOR)
  //       .shiftedBy(-tokens[1].decimals);
  //
  //     console.log(`Referrer fee: ${expectedReferrer.toString()}`);
  //
  //     const expectedReferrerBalanceSpent = expectedReferrer
  //       .plus(referrerStart.token_balances[1] || 0)
  //       .toString();
  //     const expectedDexAccount3Spent = expectedBeneficiary
  //       .plus(dexPoolInfoStart.token_fees[1])
  //       .plus(dexAccount3Start.accountBalances[1])
  //       .toString();
  //     const expectedDexReceived = new BigNumber(dexStart.token_balances[0])
  //       .minus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .toString();
  //     const expectedDexSpent = new BigNumber(dexStart.token_balances[1])
  //       .plus(TOKENS_TO_EXCHANGE)
  //       .minus(expectedReferrer)
  //       .toString();
  //     const expectedAccountReceived = new BigNumber(
  //       accountStart.token_balances[0],
  //     )
  //       .plus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .toString();
  //     const expectedAccountSpent = new BigNumber(accountStart.token_balances[1])
  //       .minus(TOKENS_TO_EXCHANGE)
  //       .toString();
  //     const expectedPoolReceived = new BigNumber(
  //       dexPoolInfoStart.token_balances[0],
  //     )
  //       .minus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .toString();
  //     const expectedPoolSpent = new BigNumber(
  //       dexPoolInfoStart.token_balances[1],
  //     )
  //       .plus(TOKENS_TO_EXCHANGE)
  //       .minus(expectedBeneficiary)
  //       .minus(expectedReferrer)
  //       .toString();
  //
  //     expect(expectedDexReceived).to.equal(
  //       dexEnd.token_balances[0].toString(),
  //       `Wrong DEX ${tokens[0].symbol} balance`,
  //     );
  //     expect(expectedDexSpent).to.equal(
  //       dexEnd.token_balances[1].toString(),
  //       `Wrong DEX ${tokens[1].symbol} balance`,
  //     );
  //     expect(expectedAccountReceived).to.equal(
  //       accountEnd.token_balances[0].toString(),
  //       `Wrong Account#2 ${tokens[0].symbol} balance`,
  //     );
  //     expect(expectedAccountSpent).to.equal(
  //       accountEnd.token_balances[1].toString(),
  //       `Wrong Account#2 ${tokens[1].symbol} balance`,
  //     );
  //     expect(expectedPoolReceived).to.equal(
  //       dexPoolInfoEnd.token_balances[0].toString(),
  //       `Wrong DEXPool ${tokens[0].symbol} balance`,
  //     );
  //     expect(expectedPoolSpent).to.equal(
  //       dexPoolInfoEnd.token_balances[1].toString(),
  //       `Wrong DEXPool ${tokens[1].symbol} balance`,
  //     );
  //     expect(expectedDexAccount3Spent).to.equal(
  //       new BigNumber(dexAccount3End.accountBalances[1])
  //         .plus(dexPoolInfoEnd.token_fees[1])
  //         .toString(),
  //       "Wrong beneficiary fee",
  //     );
  //     expect(expectedReferrerBalanceSpent).to.equal(
  //       referrerEnd.token_balances[1],
  //       "Wrong referrer fee",
  //     );
  //   });
  //
  //   it("Account#2 exchange Coin1 to Coin2 (expectedSpendAmount)", async function () {
  //     console.log("#################################################");
  //     console.log(
  //       `# Account#2 exchange ${tokens[0].symbol} to ${tokens[1].symbol}`,
  //     );
  //     const dexStart = await dexBalances();
  //     const dexAccount3Start = await dexAccountBalances(DexAccount3);
  //     const accountStart = await account2balances();
  //     const dexPoolInfoStart = await dexPoolInfo();
  //     const referrerStart = await account4balances();
  //
  //     console.log(
  //       `Account#2 balance start: ` +
  //         `${
  //           accountStart.token_balances[0] !== undefined
  //             ? accountStart.token_balances[0] + ` ${tokens[0].symbol}`
  //             : `${tokens[0].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountStart.token_balances[1] !== undefined
  //             ? accountStart.token_balances[1] + ` ${tokens[1].symbol}`
  //             : `${tokens[1].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountStart.lp !== undefined
  //             ? accountStart.lp + " LP"
  //             : "LP (not deployed)"
  //         }`,
  //     );
  //     console.log(
  //       `DexAccount#3 balance start: ` +
  //         `${dexAccount3Start.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3Start.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`,
  //     );
  //     console.log(
  //       `DexPool start: ` +
  //         `${dexPoolInfoStart.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoStart.token_balances[1]} ${tokens[1].symbol}, ` +
  //         `${dexPoolInfoStart.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoStart.token_fees[1]} ${tokens[1].symbol} FEE, ` +
  //         `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
  //         `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`,
  //     );
  //     console.log(
  //       `DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`,
  //     );
  //     let logs = `Account#4 balance start: `;
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
  //     }
  //     console.log(logs);
  //
  //     const TOKENS_TO_RECEIVE = 100;
  //
  //     let expected;
  //     if (options.roots.length === 2) {
  //       expected = await DexPool.call({
  //         method: "expectedSpendAmount",
  //         params: {
  //           receive_amount: new BigNumber(TOKENS_TO_RECEIVE)
  //             .shiftedBy(tokens[1].decimals)
  //             .toString(),
  //           receive_token_root: tokenRoots[1].address,
  //         },
  //       });
  //     } else {
  //       expected = await DexPool.call({
  //         method: "expectedSpendAmount",
  //         params: {
  //           receive_amount: new BigNumber(TOKENS_TO_RECEIVE)
  //             .shiftedBy(tokens[1].decimals)
  //             .toString(),
  //           receive_token_root: tokenRoots[1].address,
  //           spent_token_root: tokenRoots[0].address,
  //         },
  //       });
  //     }
  //
  //     console.log(
  //       `Expected spend amount: ${new BigNumber(expected.expected_amount)
  //         .shiftedBy(-tokens[0].decimals)
  //         .toString()} ${tokens[0].symbol}`,
  //     );
  //     console.log(
  //       `Expected fee: ${new BigNumber(expected.expected_fee)
  //         .shiftedBy(-tokens[0].decimals)
  //         .toString()} ${tokens[0].symbol}`,
  //     );
  //     console.log(
  //       `Expected receive amount: ${TOKENS_TO_RECEIVE} ${tokens[1].symbol}`,
  //     );
  //
  //     let payload;
  //     if (options.roots.length === 2) {
  //       payload = await DexPool.call({
  //         method: "buildExchangePayloadV2",
  //         params: {
  //           _id: 0,
  //           _deployWalletGrams: locklift.utils.convertCrystal("0.2", "nano"),
  //           _expectedAmount: 0,
  //           _recipient: Account2.address,
  //           _referrer: Account2.address,
  //         },
  //       });
  //     } else {
  //       payload = await DexPool.call({
  //         method: "buildExchangePayload",
  //         params: {
  //           id: 0,
  //           deploy_wallet_grams: 0,
  //           expected_amount: 0,
  //           outcoming: tokenRoots[1].address,
  //           recipient: Account2.address,
  //           referrer: Account2.address,
  //         },
  //       });
  //     }
  //
  //     tx = await Account2.runTarget({
  //       contract: tokenWallets2[0],
  //       method: "transfer",
  //       params: {
  //         amount: expected.expected_amount,
  //         recipient: DexPool.address,
  //         deployWalletValue: 0,
  //         remainingGasTo: Account2.address,
  //         notify: true,
  //         payload: payload,
  //       },
  //       value: locklift.utils.convertCrystal("3.3", "nano"),
  //       keyPair: keyPairs[1],
  //     });
  //
  //     displayTx(tx);
  //
  //     const dexEnd = await dexBalances();
  //     const dexAccount3End = await dexAccountBalances(DexAccount3);
  //     const accountEnd = await account2balances();
  //     const dexPoolInfoEnd = await dexPoolInfo();
  //     const referrerEnd = await account4balances();
  //
  //     console.log(
  //       `Account#2 balance end: ` +
  //         `${
  //           accountEnd.token_balances[0] !== undefined
  //             ? accountEnd.token_balances[0] + ` ${tokens[0].symbol}`
  //             : `${tokens[0].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountEnd.token_balances[1] !== undefined
  //             ? accountEnd.token_balances[1] + ` ${tokens[1].symbol}`
  //             : `${tokens[1].symbol} (not deployed)`
  //         }, ` +
  //         `${
  //           accountEnd.lp !== undefined
  //             ? accountEnd.lp + " LP"
  //             : "LP (not deployed)"
  //         }`,
  //     );
  //     console.log(
  //       `DexAccount#3 balance end: ` +
  //         `${dexAccount3End.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3End.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3End.lp} LP`,
  //     );
  //     console.log(
  //       `DexPool end: ` +
  //         `${dexPoolInfoEnd.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoEnd.token_balances[1]} ${tokens[1].symbol}, ` +
  //         `${dexPoolInfoEnd.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoEnd.token_fees[1]} ${tokens[1].symbol} FEE, ` +
  //         `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
  //         `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`,
  //     );
  //     console.log(
  //       `DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`,
  //     );
  //     logs = `Account#4 balance end: `;
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
  //     }
  //     console.log(logs);
  //
  //     await migration.logGas();
  //
  //     let expectedBeneficiary = new BigNumber(expected.expected_amount)
  //       .times(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .div(feeParams.denominator)
  //       .dp(0, BigNumber.ROUND_CEIL)
  //       .times(feeParams.beneficiary_numerator)
  //       .div(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .dp(0, BigNumber.ROUND_FLOOR)
  //       .shiftedBy(-tokens[0].decimals);
  //
  //     console.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);
  //
  //     let expectedReferrer = new BigNumber(expected.expected_amount)
  //       .times(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .div(feeParams.denominator)
  //       .dp(0, BigNumber.ROUND_CEIL)
  //       .times(feeParams.referrer_numerator)
  //       .div(
  //         new BigNumber(feeParams.pool_numerator)
  //           .plus(feeParams.beneficiary_numerator)
  //           .plus(feeParams.referrer_numerator),
  //       )
  //       .dp(0, BigNumber.ROUND_FLOOR)
  //       .shiftedBy(-tokens[0].decimals);
  //
  //     console.log(`Referrer fee: ${expectedReferrer.toString()}`);
  //
  //     const expectedReferrerBalanceSpent = expectedReferrer
  //       .plus(referrerStart.token_balances[0] || 0)
  //       .toString();
  //
  //     const expectedDexAccount3Spent = expectedBeneficiary
  //       .plus(dexPoolInfoStart.token_fees[0])
  //       .plus(dexAccount3Start.accountBalances[0])
  //       .toString();
  //
  //     const expectedDexReceived = new BigNumber(dexStart.token_balances[1])
  //       .minus(TOKENS_TO_RECEIVE)
  //       .toString();
  //     const expectedDexSpent = new BigNumber(dexStart.token_balances[0])
  //       .plus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .minus(expectedReferrer)
  //       .toString();
  //     const expectedAccountReceived = new BigNumber(
  //       accountStart.token_balances[1],
  //     )
  //       .plus(TOKENS_TO_RECEIVE)
  //       .toString();
  //     const expectedAccountSpent = new BigNumber(accountStart.token_balances[0])
  //       .minus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .toString();
  //     const expectedPoolSpent = new BigNumber(
  //       dexPoolInfoStart.token_balances[0],
  //     )
  //       .plus(
  //         new BigNumber(expected.expected_amount).shiftedBy(
  //           -tokens[0].decimals,
  //         ),
  //       )
  //       .minus(expectedBeneficiary)
  //       .minus(expectedReferrer)
  //       .toString();
  //     const expectedPoolReceived = new BigNumber(
  //       dexPoolInfoStart.token_balances[1],
  //     )
  //       .minus(TOKENS_TO_RECEIVE)
  //       .toString();
  //
  //     expect(expectedAccountSpent).to.equal(
  //       accountEnd.token_balances[0].toString(),
  //       `Wrong Account#2 ${tokens[0].symbol} balance`,
  //     );
  //     expect(expectedAccountReceived).to.equal(
  //       accountEnd.token_balances[1].toString(),
  //       `Wrong Account#2 ${tokens[1].symbol} balance`,
  //     );
  //     expect(new BigNumber(expectedPoolSpent).toNumber()).to.approximately(
  //       new BigNumber(dexPoolInfoEnd.token_balances[0]).toNumber(),
  //       new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
  //       `Wrong DEXPool ${tokens[0].symbol} balance`,
  //     );
  //     expect(expectedPoolReceived).to.equal(
  //       dexPoolInfoEnd.token_balances[1].toString(),
  //       `Wrong DEXPool ${tokens[1].symbol} balance`,
  //     );
  //     expect(expectedDexAccount3Spent).to.equal(
  //       new BigNumber(dexAccount3End.accountBalances[0])
  //         .plus(dexPoolInfoEnd.token_fees[0])
  //         .toString(),
  //       `Wrong DexAccount ${tokens[0].symbol} balance`,
  //     );
  //     expect(
  //       new BigNumber(expectedReferrerBalanceSpent).toNumber(),
  //     ).to.approximately(
  //       new BigNumber(referrerEnd.token_balances[0]).toNumber(),
  //       new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
  //       "Wrong referrer fee",
  //     );
  //     expect(new BigNumber(expectedDexSpent).toNumber()).to.approximately(
  //       new BigNumber(dexEnd.token_balances[0]).toNumber(),
  //       new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
  //       `Wrong DEX ${tokens[0].symbol} balance`,
  //     );
  //     expect(new BigNumber(expectedDexReceived).toNumber()).to.approximately(
  //       new BigNumber(dexEnd.token_balances[1]).toNumber(),
  //       new BigNumber(1).shiftedBy(-tokens[1].decimals).toNumber(),
  //       `Wrong DEX ${tokens[1].symbol} balance`,
  //     );
  //   });
  // });
  //
  // describe("Withdraw beneficiary fee", async function () {
  //   it("Account#3 withdraw fee", async function () {
  //     console.log("#################################################");
  //     console.log("# DexPool.withdrawBeneficiaryFee");
  //     const dexPoolInfoStart = await dexPoolInfo();
  //     const dexAccount3Start = await dexAccountBalances(DexAccount3);
  //
  //     let logs = "DexAccount#3 balance start: ";
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs +=
  //         `${dexAccount3Start.accountBalances[i]} ${tokens[i].symbol}` +
  //         (i === N_COINS - 1 ? "" : ", ");
  //     }
  //     console.log(logs);
  //     logs = "";
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs +=
  //         `${dexPoolInfoStart.token_fees[i]} ${tokens[i].symbol} FEE` +
  //         (i === N_COINS - 1 ? "" : ", ");
  //     }
  //     console.log(logs);
  //
  //     tx = await Account3.runTarget({
  //       contract: DexPool,
  //       method: "withdrawBeneficiaryFee",
  //       params: {
  //         send_gas_to: Account3.address,
  //       },
  //       value: locklift.utils.convertCrystal("1", "nano"),
  //       keyPair: keyPairs[2],
  //     });
  //
  //     displayTx(tx);
  //
  //     const dexPoolInfoEnd = await dexPoolInfo();
  //     const dexAccount3End = await dexAccountBalances(DexAccount3);
  //
  //     logs = `DexAccount#3 balance end: `;
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs +=
  //         `${dexAccount3End.accountBalances[i]} ${tokens[i].symbol}` +
  //         (i === N_COINS - 1 ? "" : ", ");
  //     }
  //     console.log(logs);
  //     logs = "";
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       logs +=
  //         `${dexPoolInfoEnd.token_fees[i]} ${tokens[i].symbol} FEE` +
  //         (i === N_COINS - 1 ? "" : ", ");
  //     }
  //     console.log(logs);
  //
  //     await migration.logGas();
  //
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       expect(dexPoolInfoEnd.token_fees[i]).to.equal(
  //         "0",
  //         `Wrong ${tokens[i].symbol} pool fee`,
  //       );
  //     }
  //     for (let i = 0; i < N_COINS.length; i++) {
  //       expect(
  //         new BigNumber(dexAccount3Start.accountBalances[i])
  //           .plus(dexPoolInfoStart.token_fees[i])
  //           .toString(),
  //       ).to.equal(
  //         new BigNumber(dexAccount3End.accountBalances[i])
  //           .plus(dexPoolInfoEnd.token_fees[i])
  //           .toString(),
  //         `Wrong ${tokens[i].symbol} beneficiary fee`,
  //       );
  //     }
  //   });
  // });
});
