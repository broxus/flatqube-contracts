import { expect } from "chai";
import { Address, Contract, getRandomNonce, toNano } from "locklift";
import BigNumber from "bignumber.js";
import {
  depositLiquidity,
  getPoolData,
  getWallet,
  transferWrapper,
} from "../../utils/wrappers";
import {
  expectedDepositLiquidity,
  expectedDepositLiquidityOneCoin,
  expectedExchange,
  IDepositLiquidity,
  IStableDepositLiquidity,
} from "../../utils/expected.utils";
import { Account } from "everscale-standalone-client";
import {
  DexAccountAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";

BigNumber.config({ EXPONENTIAL_AT: 257 });

let Account4: Account;
let DexOwner: Account;

const N_COINS = [6, 9, 18];

let DexAccount: Contract<DexAccountAbi>;
type poolsType = "pair";

const poolsData: Record<
  poolsType,
  {
    contract:
      | Contract<DexStablePairAbi>
      | Contract<DexStablePoolAbi>
      | Contract<DexPairAbi>;
    tokens: string[];
    roots: Contract<TokenRootUpgradeableAbi>[];
    lp: Contract<TokenRootUpgradeableAbi>;
  }
> = {
  pair: {
    contract: null,
    tokens: ["token-9-0", "token-9-1"],
    roots: [],
    lp: null,
  },
};

describe(`Test beneficiary fee`, function () {
  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-accounts", "dex-pairs"],
    });

    DexOwner = locklift.deployments.getAccount("DexOwner").account;
    Account4 = locklift.deployments.getAccount("commonAccount-1").account;

    DexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    poolsData.pair.contract =
      locklift.deployments.getContract<DexStablePairAbi>(
        "DexPair_" + poolsData.pair.tokens.join("_"),
      );

    for (const pool in poolsData) {
      poolsData[pool as poolsType].roots = poolsData[
        pool as poolsType
      ].tokens.map((token: string) =>
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(token),
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
  });

  // before("Set referral program params", async function () {
  //   displayTx(tx);
  // });

  describe("Deposit multiple coins to stablePool/stablePair/pair", async function () {
    it("Add multiple coins imbalanced liquidity", async function () {
      // loading contract data based on name
      for (const contractName of ["pair"]) {
        const contractData = poolsData[contractName as poolsType];
        const poolDataStart = await getPoolData(contractData.contract);
        const operations = [];
        const poolType = (
          await contractData.contract.methods
            .getPoolType({ answerId: 0 })
            .call()
        ).value0;

        // at least one coin should be different, or fees won't count
        for (let i = 0; i < contractData.roots.length; i++) {
          // if its DexPair, decimals are same
          const amountDecimals = poolType !== "1" ? (i % 2 ? 5 : 9) : 5;
          const amount = (10 ** amountDecimals).toString();
          operations.push({
            amount: amount,
            root: contractData.roots[i].address,
          });
        }

        const expected = await expectedDepositLiquidity(
          contractData.contract,
          operations,
          true,
          Account4.address,
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
              _expected: { amount: LP_REWARD, root: contractData.lp.address },
              _autoChange: true,
              _remainingGasTo: DexOwner.address,
              _referrer: Account4.address,
            })
            .send({
              amount: toNano(5),
              from: DexOwner.address,
            }),
        );

        const poolDataEnd = await getPoolData(contractData.contract);

        const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
          await getWallet(DexOwner.address, contractData.lp.address).then(
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

        console.log(expected, "expected");
        // checking fee to referrer from every token
        for (const [token, fee] of Object.entries(expected.referrerFees)) {
          const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
            await getWallet(Account4.address, new Address(token)).then(
              a => a.walletContract,
            ),
          );

          console.log(refAccountChange, contractName, "refAccountChange");
          console.log(fee, contractName, "fee");
          expect(String(refAccountChange)).to.equal(
            String(fee),
            `Ref System has wrong balance`,
          );
        }
        expect(
          new BigNumber(poolDataStart.lpSupply).plus(LP_REWARD).toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

        console.log(`       ${contractName} multiple deposit done ✅`);
      }
    });
  });

  describe("Direct deposit to stablePool/stablePair/pair", async function () {
    it("DexOwner deposit Coin1 liquidity", async function () {
      // loading contract data based on name
      for (const contractName of ["pair"]) {
        const TOKEN_NUM = 1;
        const contractData = poolsData[contractName as poolsType];
        const poolDataStart = await getPoolData(contractData.contract);
        const poolType = (
          await contractData.contract.methods
            .getPoolType({ answerId: 0 })
            .call()
        ).value0;

        const operations = {
          root: contractData.roots[TOKEN_NUM].address,
          amount: (10 ** N_COINS[TOKEN_NUM]).toString(),
        };
        const root = operations.root.toString();

        const expectedData =
          poolType === "3" // stablePool
            ? await expectedDepositLiquidityOneCoin(
                contractData.contract as Contract<DexStablePoolAbi>,
                operations.amount,
                operations.root,
                Account4.address,
              )
            : await expectedDepositLiquidity(
                contractData.contract,
                [
                  {
                    root: contractData.roots[0].address,
                    amount: 0,
                  },
                  operations,
                ],
                true,
                Account4.address,
              );

        const LP_REWARD = expectedData.lpReward;
        const payload =
          poolType === "3" // stablePool
            ? await contractData.contract.methods
                .buildDepositLiquidityPayload({
                  id: 0,
                  deploy_wallet_grams: toNano(0.05),
                  expected_amount: LP_REWARD,
                  recipient: DexOwner.address,
                  referrer: Account4.address,
                  success_payload: null,
                  cancel_payload: null,
                })
                .call()
            : await (
                contractData.contract as
                  | Contract<DexPairAbi>
                  | Contract<DexStablePairAbi>
              ).methods
                .buildDepositLiquidityPayloadV2({
                  _id: 0,
                  _deployWalletGrams: toNano(0.1),
                  _expectedAmount: LP_REWARD,
                  _recipient: DexOwner.address,
                  _referrer: Account4.address,
                  _successPayload: null,
                  _cancelPayload: null,
                })
                .call();

        const walletForNewAcc = await contractData.roots[TOKEN_NUM].methods
          .walletOf({ walletOwner: DexOwner.address, answerId: 0 })
          .call();

        const tokenWallet = locklift.factory.getDeployedContract(
          "TokenWalletUpgradeable",
          walletForNewAcc.value0,
        );

        const { traceTree } = await locklift.tracing.trace(
          await tokenWallet.methods
            .transfer({
              amount: operations.amount,
              recipient: contractData.contract.address,
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

        const poolDataEnd = await getPoolData(contractData.contract);

        // expectedData return types are different
        // checking pool/pair changes for DEPOSITED coin
        if (poolType === "3") {
          const expected: IStableDepositLiquidity =
            expectedData as IStableDepositLiquidity;
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

          const ROOT_1 = contractData.roots[TOKEN_NUM].address.toString();
          expect(+poolDataStart.accumulatedFees[ROOT_1]).to.lessThanOrEqual(
            +poolDataEnd.accumulatedFees[ROOT_1],
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
            await getWallet(DexOwner.address, contractData.lp.address).then(
              a => a.walletContract,
            ),
          );
          expect(String(accountLpChange)).to.equal(expected.lpReward);
        } else {
          const expected: IDepositLiquidity = expectedData as IDepositLiquidity;
          // check balance change with fees
          expect(
            new BigNumber(poolDataStart.balances[root])
              .plus(operations.amount)
              .minus(expected.beneficiaryFees[root])
              .minus(expected.referrerFees[root])
              .toString(),
          ).to.equal(poolDataEnd.balances[root], `Pool has wrong balance`);

          // check total fees and supply of pool
          expect(poolDataStart.actualTotalSupply).to.equal(
            new BigNumber(poolDataEnd.actualTotalSupply)
              .minus(LP_REWARD)
              .toString(),
            "WRONG actualTotalSupply!",
          );

          // check total fees and supply of pool
          expect(poolDataStart.actualTotalSupply).to.equal(
            new BigNumber(poolDataEnd.actualTotalSupply)
              .minus(LP_REWARD)
              .toString(),
            "WRONG actualTotalSupply!",
          );

          const ROOT_1 = contractData.roots[TOKEN_NUM].address.toString();
          expect(+poolDataStart.accumulatedFees[ROOT_1]).to.lessThanOrEqual(
            +poolDataEnd.accumulatedFees[ROOT_1],
            "Fees didnt change in pool",
          );

          // check referrer account FEES
          const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
            await getWallet(Account4.address, operations.root).then(
              a => a.walletContract,
            ),
          );
          expect(String(refAccountChange)).to.equal(
            expected.referrerFees[root],
            `Ref System has wrong balance`,
          );

          // check LP balance of pool
          const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
            await getWallet(DexOwner.address, contractData.lp.address).then(
              a => a.walletContract,
            ),
          );
          expect(String(accountLpChange)).to.equal(expected.lpReward);
        }

        console.log(`       ${contractName} deposit done ✅`);
      }
    });
  });

  describe("Direct exchange with stablePool/stablePair/pair", function () {
    const TOKEN_1 = 0;
    const TOKEN_2 = 1;

    it(`exchange token-${N_COINS[TOKEN_1]} --> token-${N_COINS[TOKEN_2]}`, async function () {
      for (const contractName of ["pair"]) {
        const contractData = poolsData[contractName as poolsType];
        const poolDataStart = await getPoolData(contractData.contract);
        const TOKENS_TO_EXCHANGE = 10 ** N_COINS[TOKEN_2];
        const poolType = (
          await contractData.contract.methods
            .getPoolType({ answerId: 0 })
            .call()
        ).value0;

        const expected = await expectedExchange(
          contractData.contract,
          TOKENS_TO_EXCHANGE,
          contractData.roots[TOKEN_2].address,
          contractData.roots[TOKEN_1].address,
          Account4.address,
        );

        const payload =
          poolType === "3"
            ? await (
                contractData.contract as Contract<DexStablePoolAbi>
              ).methods
                .buildExchangePayload({
                  id: 0,
                  deploy_wallet_grams: toNano(0.05),
                  expected_amount: expected.receivedAmount,
                  outcoming: contractData.roots[TOKEN_1].address,
                  recipient: DexOwner.address,
                  referrer: Account4.address,
                  success_payload: null,
                  cancel_payload: null,
                  toNative: false,
                })
                .call()
            : await (
                contractData.contract as
                  | Contract<DexStablePairAbi>
                  | Contract<DexPairAbi>
              ).methods
                .buildExchangePayloadV2({
                  _id: 0,
                  _deployWalletGrams: toNano(0.1),
                  _expectedAmount: expected.receivedAmount,
                  _recipient: DexOwner.address,
                  _referrer: Account4.address,
                  _successPayload: null,
                  _cancelPayload: null,
                  _toNative: false,
                })
                .call();

        const walletForNewAcc = await contractData.roots[TOKEN_2].methods
          .walletOf({ walletOwner: DexOwner.address, answerId: 0 })
          .call();

        const tokenWallet = locklift.factory.getDeployedContract(
          "TokenWalletUpgradeable",
          walletForNewAcc.value0,
        );

        const { traceTree } = await locklift.tracing.trace(
          await tokenWallet.methods
            .transfer({
              amount: TOKENS_TO_EXCHANGE,
              recipient: contractData.contract.address,
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

        const poolDataEnd = await getPoolData(contractData.contract);

        // checking balance change for both tokens
        const ROOT_1 = contractData.roots[TOKEN_1].address.toString();
        const ROOT_2 = contractData.roots[TOKEN_2].address.toString();

        expect(
          new BigNumber(poolDataStart.balances[ROOT_1])
            .minus(expected.receivedAmount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[ROOT_1],
          `${contractData.roots[TOKEN_1]} has wrong balance`,
        );
        expect(
          new BigNumber(poolDataStart.balances[ROOT_2])
            .plus(TOKENS_TO_EXCHANGE)
            .minus(expected.beneficiaryFee)
            .minus(expected.referrerFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[ROOT_2],
          `${contractData.roots[TOKEN_2]} has wrong balance`,
        );

        // checking referrer fees!
        const refAccountChange = traceTree?.tokens.getTokenBalanceChange(
          await getWallet(
            Account4.address,
            new Address(contractData.roots[TOKEN_2].address.toString()),
          ).then(a => a.walletContract),
        );

        expect(String(refAccountChange)).to.equal(
          expected.referrerFee,
          `Ref System has wrong balance`,
        );

        console.log(`       ${contractName} exchange done ✅`);
      }
    });
  });
});
