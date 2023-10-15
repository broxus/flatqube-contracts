import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Account } from "locklift/everscale-client";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  TokenRootUpgradeableAbi,
} from "../build/factorySource";
import { calcValue } from "../utils/gas.utils";
import {
  getDexAccountData,
  getPoolData,
  getWallet,
  ITokens,
  transferWrapper,
} from "../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedDepositLiquidity,
  expectedExchange,
  expectedWithdrawLiquidity,
} from "../utils/expected.utils";

const LP_DECIMALS = 9;

describe("Check DexAccount operations (dex-pair)", () => {
  let owner: Account;
  let dexAccount: Contract<DexAccountAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let pair: Contract<DexPairAbi>;
  let pairTokens: string[] = ["token-9-0", "token-9-1"];
  let pairRoots: Contract<TokenRootUpgradeableAbi>[];
  let lpRoot: Contract<TokenRootUpgradeableAbi>;

  let tokensData: Record<string, { decimals: number }> = {};

  async function getDepositGas(autoChange: boolean) {
    return gasValues.methods
      .getAccountDepositGas({
        N: 2,
        referrer: zeroAddress,
        autoChange: autoChange,
      })
      .call()
      .then(a => a.value0);
  }

  async function getExchangeGas() {
    return gasValues.methods
      .getAccountExchangeGas()
      .call()
      .then(a => a.value0);
  }

  async function getWithdrawLiquidityGas() {
    return gasValues.methods
      .getAccountWithdrawLiquidityGas({ N: 2 })
      .call()
      .then(a => a.value0);
  }

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-accounts", "dex-pairs"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;

    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
    pair = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_" + pairTokens.join("_"),
    );

    // add pools to DexAccount + transfer to dexAccount
    pairRoots = pairTokens.map((token: string) =>
      locklift.deployments.getContract<TokenRootUpgradeableAbi>(token),
    );
    for (let root of pairRoots) {
      tokensData[root.address.toString()] = {
        decimals: await root.methods
          .decimals({ answerId: 0 })
          .call()
          .then(a => Number(a.value0)),
      };
    }
    await dexAccount.methods
      .addPool({
        _roots: pairRoots.map(
          (root: Contract<TokenRootUpgradeableAbi>) => root.address,
        ),
      })
      .send({
        from: owner.address,
        amount: toNano(5),
      });
    lpRoot = locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      await pair.methods
        .getTokenRoots({ answerId: 0 })
        .call()
        .then(a => a.lp),
    );
    const deposits: ITokens[] = pairRoots.map(
      (token: Contract<TokenRootUpgradeableAbi>) => {
        return {
          root: token.address,
          amount: new BigNumber(100)
            .shiftedBy(tokensData[token.address.toString()].decimals)
            .toString(),
        };
      },
    );
    await transferWrapper(owner.address, dexAccount.address, 0, deposits);
  });

  describe("Initial deposit to pool", () => {
    it("Initial deposit to DexPair", async () => {
      const gas = await getDepositGas(true);

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const amounts = pairRoots.map(root =>
        new BigNumber(10)
          .shiftedBy(tokensData[root.address.toString()].decimals)
          .toString(),
      );
      const expectedLpAmount = BigNumber.max(...amounts).toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: pairRoots[0].address,
            left_amount: amounts[0],
            right_root: pairRoots[1].address,
            right_amount: amounts[1],
            expected_lp_root: lpRoot.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree).to.emit("DepositLiquidity", pair).withNamedArgs({
        lp: expectedLpAmount,
      });

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, lpRoot.address).then(
          a => a.walletContract,
        ),
      );
      expect(String(accountLpChange)).to.equal(expectedLpAmount);

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .plus(amounts[i])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i]).minus(amounts[i]).toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(
        new BigNumber(poolDataStart.lpSupply).plus(expectedLpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });

  describe("Deposit to pool", () => {
    it("Deposit to DexPair, auto_change = false", async () => {
      const gas = await getDepositGas(false);

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(tokensData[pairRoots[i].address.toString()].decimals)
          .toString(),
      );
      const expectedDepositData = await expectedDepositLiquidity(
        pair,
        [
          { root: pairRoots[0].address, amount: amounts[0] },
          { root: pairRoots[1].address, amount: amounts[1] },
        ],
        false,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: pairRoots[0].address,
            left_amount: amounts[0],
            right_root: pairRoots[1].address,
            right_amount: amounts[1],
            expected_lp_root: lpRoot.address,
            auto_change: false,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", pair)
        .count(1)
        .withNamedArgs({
          lp: expectedDepositData.lpReward,
        })
        .and.call("internalPoolTransfer", dexAccount.address)
        .withNamedArgs({
          _tokenRoot: pairRoots[1].address,
        });

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, lpRoot.address).then(
          a => a.walletContract,
        ),
      );
      expect(String(accountLpChange)).to.equal(expectedDepositData.lpReward);

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .plus(expectedDepositData.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i])
            .minus(expectedDepositData.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit to DexPair, auto_change = true", async () => {
      const gas = await getDepositGas(true);

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(tokensData[pairRoots[i].address.toString()].decimals)
          .toString(),
      );
      const expectedDepositData = await expectedDepositLiquidity(
        pair,
        [
          { root: pairRoots[0].address, amount: amounts[0] },
          { root: pairRoots[1].address, amount: amounts[1] },
        ],
        true,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: pairRoots[0].address,
            left_amount: amounts[0],
            right_root: pairRoots[1].address,
            right_amount: amounts[1],
            expected_lp_root: lpRoot.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", pair)
        .count(2)
        .to.emit("Exchange", pair)
        .count(1);

      const accountLpChange = traceTree?.tokens.getTokenBalanceChange(
        await getWallet(owner.address, lpRoot.address).then(
          a => a.walletContract,
        ),
      );
      expect(String(accountLpChange)).to.equal(expectedDepositData.lpReward);

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots
        .map(root => root.address.toString())
        .forEach((root, i) => {
          expect(
            new BigNumber(poolDataStart.balances[root])
              .plus(amounts[i])
              .minus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.balances[root],
            `Pool has wrong ${pairTokens[i]} balance`,
          );
          expect(
            new BigNumber(poolDataStart.accumulatedFees[root])
              .plus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.accumulatedFees[root],
            `Pool has wrong ${pairTokens[i]} fees`,
          );
          expect(
            new BigNumber(accountDataStart[i]).minus(amounts[i]).toString(),
          ).to.equal(
            accountDataEnd[i],
            `Account has wrong ${pairTokens[i]} balances`,
          );
        });
      expect(
        new BigNumber(poolDataStart.lpSupply)
          .plus(expectedDepositData.lpReward)
          .toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit to DexPair, expectedLpAmount > lp_amount (revert)", async () => {
      const gas = await getDepositGas(true);

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const operations = [1, 2].map((amount, i) => {
        return {
          root: pairRoots[i].address,
          amount: new BigNumber(amount)
            .shiftedBy(tokensData[pairRoots[i].address.toString()].decimals)
            .toString(),
        };
      });
      const expectedLpReward = await expectedDepositLiquidity(
        pair,
        operations,
        true,
      ).then(a => a.lpReward);

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: new BigNumber(expectedLpReward).plus(1).toString(),
            root: lpRoot.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });
  });

  describe("Exchange", () => {
    it("Check DexPair exchange", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[pairRoots[0].address.toString()].decimals)
        .toString();

      const expected = await expectedExchange(
        pair,
        spentAmount,
        pairRoots[0].address,
        pairRoots[1].address,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .exchange({
            call_id: getRandomNonce(),
            spent_amount: spentAmount,
            spent_token_root: pairRoots[0].address,
            receive_token_root: pairRoots[1].address,
            expected_amount: "0",
            send_gas_to: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
      );
      expect(traceTree).to.emit("Exchange", pair).count(1);

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      expect(
        new BigNumber(poolDataStart.balances[pairRoots[0].address.toString()])
          .plus(spentAmount)
          .minus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[pairRoots[0].address.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[pairRoots[1].address.toString()])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[pairRoots[1].address.toString()],
        `Pool has wrong received token balance`,
      );

      expect(
        new BigNumber(
          poolDataStart.accumulatedFees[pairRoots[0].address.toString()],
        )
          .plus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.accumulatedFees[pairRoots[0].address.toString()],
        `Pool has wrong ${pairTokens[0]} fees`,
      );

      expect(
        new BigNumber(accountDataStart[0]).minus(spentAmount).toString(),
      ).to.equal(accountDataEnd[0], `Account has wrong spent token balances`);
      expect(
        new BigNumber(accountDataStart[1])
          .plus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        accountDataEnd[1],
        `Account has wrong received token balances`,
      );
    });

    it("Check DexPair exchange, expectedAmount > received amount (revert)", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[pairRoots[0].address.toString()].decimals)
        .toString();

      const expected = await expectedExchange(
        pair,
        spentAmount,
        pairRoots[0].address,
        pairRoots[1].address,
      );

      await dexAccount.methods
        .exchange({
          call_id: getRandomNonce(),
          spent_amount: spentAmount,
          spent_token_root: pairRoots[0].address,
          receive_token_root: pairRoots[1].address,
          expected_amount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          send_gas_to: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );
      pairRoots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
    });
  });

  describe("Withdraw liquidity", () => {
    it("Check withdraw liquidity in case of zero account lp_balance (revert)", async () => {
      const gas = await getWithdrawLiquidityGas();

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS).toString();

      await dexAccount.methods
        .withdrawLiquidity({
          call_id: getRandomNonce(),
          lp_amount: lpAmount,
          lp_root: lpRoot.address,
          left_root: pairRoots[0].address,
          right_root: pairRoots[1].address,
          send_gas_to: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });

    it("Check withdraw liquidity", async () => {
      await transferWrapper(owner.address, dexAccount.address, 0, [
        {
          root: lpRoot.address,
          amount: new BigNumber(1).shiftedBy(LP_DECIMALS).toString(),
        },
      ]);

      const gas = await getWithdrawLiquidityGas();

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(pair, lpAmount);

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdrawLiquidity({
            call_id: getRandomNonce(),
            lp_amount: lpAmount,
            lp_root: lpRoot.address,
            left_root: pairRoots[0].address,
            right_root: pairRoots[1].address,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );
      expect(traceTree).to.emit("WithdrawLiquidity", pair).count(1);

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .minus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i])
            .plus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });

    it("Check withdraw liquidity, expectedAmount > received amount (revert)", async () => {
      const gas = await getWithdrawLiquidityGas();

      const poolDataStart = await getPoolData(pair);
      const accountDataStart = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS).toString();

      const expected = await expectedWithdrawLiquidity(pair, lpAmount);
      expected.amounts[pairRoots[0].address.toString()] = new BigNumber(
        expected.amounts[pairRoots[0].address.toString()],
      )
        .plus(1)
        .toString();

      await dexAccount.methods
        .withdrawLiquidityV2({
          _callId: getRandomNonce(),
          _operation: { amount: lpAmount, root: lpRoot.address },
          _expected: pairRoots.map(root => {
            return {
              root: root.address,
              amount: expected.amounts[root.address.toString()],
            };
          }),
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(pair);
      const accountDataEnd = await getDexAccountData(
        pairRoots.map(root => root.address),
        dexAccount,
      );

      pairRoots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${pairTokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${pairTokens[i]} balances`,
        );
      });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });
  });
});
