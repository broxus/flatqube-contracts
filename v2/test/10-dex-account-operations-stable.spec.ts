import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../utils/gas.utils";
import {
  getDexAccountData,
  getPoolData,
  ITokens,
  transferWrapper,
} from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedDepositLiquidity,
  expectedExchange,
  expectedWithdrawLiquidity,
  expectedWithdrawLiquidityOneCoin,
} from "../utils/math.utils";

const LP_DECIMALS = 9;

describe("Check DexAccount add Pair", () => {
  let owner: Account;
  let dexAccount: Contract<DexAccountAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let poolsData: Record<
    string,
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

  let tokensData: Record<string, { decimals: number }> = {};

  async function getDepositGas(N: number) {
    return gasValues.methods
      .getAccountDepositGas({ N: N, referrer: zeroAddress, autoChange: true })
      .call()
      .then(a => a.value0);
  }

  async function getExchangeGas() {
    return gasValues.methods
      .getAccountExchangeGas()
      .call()
      .then(a => a.value0);
  }

  async function getWithdrawLiquidityGas(N: number) {
    return gasValues.methods
      .getAccountWithdrawLiquidityGas({ N: N })
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
      for (let root of poolsData[pool].roots) {
        tokensData[root.address.toString()] = {
          decimals: await root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        };
      }
    }

    // add pools to DexAccount + transfer to dexAccount
    for (let pool in poolsData) {
      await dexAccount.methods
        .addPool({
          _roots: poolsData[pool].roots.map(
            (root: Contract<TokenRootUpgradeableAbi>) => root.address,
          ),
        })
        .send({
          from: owner.address,
          amount: toNano(5),
        });
      poolsData[pool].lp = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        await poolsData[pool].contract.methods
          .getTokenRoots({ answerId: 0 })
          .call()
          .then(a => a.lp),
      );
    }
    const deposits: ITokens[] = Object.values(poolsData)
      .map(elem => elem.roots)
      .flat()
      .filter((value, index, array) => array.indexOf(value) === index)
      .map((token: Contract<TokenRootUpgradeableAbi>) => {
        return {
          root: token.address,
          amount: new BigNumber(1).shiftedBy(20).toString(),
        };
      });
    await transferWrapper(owner.address, dexAccount.address, 0, deposits);
  });

  describe("Initial deposit to pool", () => {
    it("Deposit unequal amounts of tokens to DexStablePair (revert)", async () => {
      const gas = await getDepositGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      await dexAccount.methods
        .depositLiquidity({
          call_id: getRandomNonce(),
          left_root: poolsData.stablePair.roots[0].address,
          left_amount: new BigNumber(1)
            .shiftedBy(
              tokensData[poolsData.stablePair.roots[0].address.toString()]
                .decimals,
            )
            .toString(),
          right_root: poolsData.stablePair.roots[1].address,
          right_amount: new BigNumber(1)
            .shiftedBy(
              tokensData[poolsData.stablePair.roots[1].address.toString()]
                .decimals + 1,
            )
            .toString(),
          expected_lp_root: poolsData.stablePair.lp.address,
          auto_change: true,
          send_gas_to: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
        );
      });
    });

    it("Deposit unequal amounts of tokens to DexStablePool (revert)", async () => {
      const gas = await getDepositGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const operations = poolsData.stablePool.roots.map(root => {
        return {
          root: root.address,
          amount: new BigNumber(1)
            .shiftedBy(tokensData[root.address.toString()].decimals)
            .toString(),
        };
      });
      operations[0].amount = operations[0].amount + "0";

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: 0,
            root: poolsData.stablePool.lp.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
        );
      });
    });

    it("Initial deposit to DexStablePair", async () => {
      const gas = await getDepositGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const amounts = poolsData.stablePair.roots.map(root =>
        new BigNumber(1)
          .shiftedBy(tokensData[root.address.toString()].decimals)
          .toString(),
      );
      const expectedLpAmount = new BigNumber(2)
        .shiftedBy(LP_DECIMALS)
        .toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: poolsData.stablePair.roots[0].address,
            left_amount: amounts[0],
            right_root: poolsData.stablePair.roots[1].address,
            right_amount: amounts[1],
            expected_lp_root: poolsData.stablePair.lp.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .withNamedArgs({
          lp: expectedLpAmount,
        });

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .plus(amounts[i])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i]).minus(amounts[i]).toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
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

    it("Initial deposit to DexStablePool", async () => {
      const gas = await getDepositGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const operations = poolsData.stablePool.roots.map(root => {
        return {
          root: root.address,
          amount: new BigNumber(1)
            .shiftedBy(tokensData[root.address.toString()].decimals)
            .toString(),
        };
      });
      const expectedLpAmount = new BigNumber(3)
        .shiftedBy(LP_DECIMALS)
        .toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidityV2({
            _callId: getRandomNonce(),
            _operations: operations,
            _expected: {
              amount: expectedLpAmount,
              root: poolsData.stablePool.lp.address,
            },
            _autoChange: true,
            _remainingGasTo: owner.address,
            _referrer: zeroAddress,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .withNamedArgs({
          lp: expectedLpAmount,
        });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .plus(operations[i].amount)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i])
            .minus(operations[i].amount)
            .toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
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
    it("Deposit to DexStablePair", async () => {
      const gas = await getDepositGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(
            tokensData[poolsData.stablePair.roots[i].address.toString()]
              .decimals - 3,
          )
          .toString(),
      );
      const expectedDepositData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          { root: poolsData.stablePair.roots[0].address, amount: amounts[0] },
          { root: poolsData.stablePair.roots[1].address, amount: amounts[1] },
        ],
        false,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: poolsData.stablePair.roots[0].address,
            left_amount: amounts[0],
            right_root: poolsData.stablePair.roots[1].address,
            right_amount: amounts[1],
            expected_lp_root: poolsData.stablePair.lp.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.stablePair.contract)
        .count(1)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots
        .map(root => root.address.toString())
        .forEach((root, i) => {
          expect(
            new BigNumber(poolDataStart.balances[root])
              .plus(amounts[i])
              .minus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.balances[root],
            `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
          );
          expect(
            new BigNumber(poolDataStart.accumulatedFees[root])
              .plus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.accumulatedFees[root],
            `Pool has wrong ${poolsData.stablePair.tokens[i]} fees`,
          );
          expect(
            new BigNumber(accountDataStart[i]).minus(amounts[i]).toString(),
          ).to.equal(
            accountDataEnd[i],
            `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
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

    it("Deposit to DexStablePair, expectedLpAmount > lp_amount (revert)", async () => {
      const gas = await getDepositGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const operations = [1, 2].map((amount, i) => {
        return {
          root: poolsData.stablePair.roots[i].address,
          amount: new BigNumber(amount)
            .shiftedBy(
              tokensData[poolsData.stablePair.roots[i].address.toString()]
                .decimals - 3,
            )
            .toString(),
        };
      });

      const expectedDepositData = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        operations,
        false,
      );

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: new BigNumber(expectedDepositData.lpReward)
              .plus(1)
              .toString(),
            root: poolsData.stablePair.lp.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots
        .map(root => root.address.toString())
        .forEach((root, i) => {
          expect(poolDataStart.balances[root]).to.equal(
            poolDataEnd.balances[root],
            `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
          );
          expect(accountDataStart[i]).to.equal(
            accountDataEnd[i],
            `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
          );
        });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit to DexStablePool", async () => {
      const gas = await getDepositGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const operations = [1, 2, 0].map((amount, i) => {
        return {
          root: poolsData.stablePool.roots[i].address,
          amount: new BigNumber(amount)
            .shiftedBy(
              tokensData[poolsData.stablePool.roots[i].address.toString()]
                .decimals - 3,
            )
            .toString(),
        };
      });

      const expectedDepositData = await expectedDepositLiquidity(
        poolsData.stablePool.contract,
        operations,
        false,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidityV2({
            _callId: getRandomNonce(),
            _operations: operations,
            _expected: {
              amount: expectedDepositData.lpReward,
              root: poolsData.stablePool.lp.address,
            },
            _autoChange: true,
            _remainingGasTo: owner.address,
            _referrer: zeroAddress,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .withNamedArgs({
          lp: expectedDepositData.lpReward,
        });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots
        .map(root => root.address.toString())
        .forEach((root, i) => {
          expect(
            new BigNumber(poolDataStart.balances[root])
              .plus(operations[i].amount)
              .minus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.balances[root],
            `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
          );
          expect(
            new BigNumber(poolDataStart.accumulatedFees[root])
              .plus(expectedDepositData.beneficiaryFees[root])
              .toString(),
          ).to.equal(
            poolDataEnd.accumulatedFees[root],
            `Pool has wrong ${poolsData.stablePool.tokens[i]} fees`,
          );
          expect(
            new BigNumber(accountDataStart[i])
              .minus(operations[i].amount)
              .toString(),
          ).to.equal(
            accountDataEnd[i],
            `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
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

    it("Deposit to DexStablePool, expectedLpAmount > lp_amount (revert)", async () => {
      const gas = await getDepositGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const operations = [1, 2, 0].map((amount, i) => {
        return {
          root: poolsData.stablePool.roots[i].address,
          amount: new BigNumber(amount)
            .shiftedBy(
              tokensData[poolsData.stablePool.roots[i].address.toString()]
                .decimals - 3,
            )
            .toString(),
        };
      });

      const expectedDepositData = await expectedDepositLiquidity(
        poolsData.stablePool.contract,
        operations,
        false,
      );

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: new BigNumber(expectedDepositData.lpReward)
              .plus(1)
              .toString(),
            root: poolsData.stablePool.lp.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots
        .map(root => root.address.toString())
        .forEach((root, i) => {
          expect(poolDataStart.balances[root]).to.equal(
            poolDataEnd.balances[root],
            `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
          );
          expect(accountDataStart[i]).to.equal(
            accountDataEnd[i],
            `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
          );
        });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit to non-exists pool", async () => {
      const gas = await getDepositGas(2);

      const operations = [
        { root: poolsData.stablePair.roots[0].address, amount: "100000" },
        { root: poolsData.stablePool.roots[2].address, amount: "100000" },
      ];
      const roots = operations.map(a => a.root);

      const accountDataStart = await getDexAccountData(roots, dexAccount);

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: 0,
            root: poolsData.stablePair.lp.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const accountDataEnd = await getDexAccountData(roots, dexAccount);

      roots.forEach((root, i) => {
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong balances`,
        );
      });
    });
  });

  describe("Exchange", () => {
    it("Check DexStablePair exchange", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const spentTokenAddress = poolsData.stablePair.roots[0].address;
      const receiveTokenAddress = poolsData.stablePair.roots[1].address;

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[spentTokenAddress.toString()].decimals - 2)
        .toString();

      const expected = await expectedExchange(
        poolsData.stablePair.contract,
        spentAmount,
        spentTokenAddress,
        receiveTokenAddress,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .exchange({
            call_id: getRandomNonce(),
            spent_amount: spentAmount,
            spent_token_root: spentTokenAddress,
            receive_token_root: receiveTokenAddress,
            expected_amount: expected.receivedAmount,
            send_gas_to: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      expect(
        new BigNumber(poolDataStart.balances[spentTokenAddress.toString()])
          .plus(spentAmount)
          .minus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentTokenAddress.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[receiveTokenAddress.toString()])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receiveTokenAddress.toString()],
        `Pool has wrong received token balance`,
      );

      expect(
        new BigNumber(
          poolDataStart.accumulatedFees[spentTokenAddress.toString()],
        )
          .plus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.accumulatedFees[spentTokenAddress.toString()],
        `Pool has wrong spent token fees`,
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

    it("Check DexStablePair exchange, expectedAmount > received amount (revert)", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const spentTokenAddress = poolsData.stablePair.roots[0].address;
      const receiveTokenAddress = poolsData.stablePair.roots[1].address;

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[spentTokenAddress.toString()].decimals - 2)
        .toString();

      const expected = await expectedExchange(
        poolsData.stablePair.contract,
        spentAmount,
        spentTokenAddress,
        receiveTokenAddress,
      );

      await dexAccount.methods
        .exchange({
          call_id: getRandomNonce(),
          spent_amount: spentAmount,
          spent_token_root: spentTokenAddress,
          receive_token_root: receiveTokenAddress,
          expected_amount: new BigNumber(expected.receivedAmount)
            .plus(1)
            .toString(),
          send_gas_to: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );
      poolsData.stablePair.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
        );
      });
    });

    it("Check DexStablePool exchange", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const spentTokenAddress = poolsData.stablePool.roots[0].address;
      const receiveTokenAddress = poolsData.stablePool.roots[1].address;

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[spentTokenAddress.toString()].decimals - 2)
        .toString();

      const expected = await expectedExchange(
        poolsData.stablePool.contract,
        spentAmount,
        spentTokenAddress,
        receiveTokenAddress,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .exchangeV2({
            _callId: getRandomNonce(),
            _operation: { root: spentTokenAddress, amount: spentAmount },
            _expected: {
              root: receiveTokenAddress,
              amount: expected.receivedAmount,
            },
            _roots: poolsData.stablePool.roots.map(root => root.address),
            _remainingGasTo: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
      );
      expect(traceTree)
        .to.emit("Exchange", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      expect(
        new BigNumber(poolDataStart.balances[spentTokenAddress.toString()])
          .plus(spentAmount)
          .minus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[spentTokenAddress.toString()],
        `Pool has wrong spent token balance`,
      );
      expect(
        new BigNumber(poolDataStart.balances[receiveTokenAddress.toString()])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receiveTokenAddress.toString()],
        `Pool has wrong received token balance`,
      );

      expect(
        new BigNumber(
          poolDataStart.accumulatedFees[spentTokenAddress.toString()],
        )
          .plus(expected.beneficiaryFee)
          .toString(),
      ).to.equal(
        poolDataEnd.accumulatedFees[spentTokenAddress.toString()],
        `Pool has wrong spent token fees`,
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

    it("Check DexStablePool exchange, expectedAmount > received amount (revert)", async () => {
      const gas = await getExchangeGas();

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const spentTokenAddress = poolsData.stablePool.roots[0].address;
      const receiveTokenAddress = poolsData.stablePool.roots[1].address;

      const spentAmount = new BigNumber(2)
        .shiftedBy(tokensData[spentTokenAddress.toString()].decimals - 2)
        .toString();

      const expected = await expectedExchange(
        poolsData.stablePool.contract,
        spentAmount,
        spentTokenAddress,
        receiveTokenAddress,
      );

      await dexAccount.methods
        .exchangeV2({
          _callId: getRandomNonce(),
          _operation: { root: spentTokenAddress, amount: spentAmount },
          _expected: {
            root: receiveTokenAddress,
            amount: new BigNumber(expected.receivedAmount).plus(1).toString(),
          },
          _roots: poolsData.stablePool.roots.map(root => root.address),
          _remainingGasTo: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );
      poolsData.stablePool.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
        );
      });
    });

    it("Exchange in non-exists pool", async () => {
      const gas = await getExchangeGas();

      const roots = [
        poolsData.stablePair.roots[0].address,
        poolsData.stablePool.roots[2].address,
      ];
      const operation = { root: roots[0], amount: "100000" };
      const expected = { root: roots[1], amount: "0" };

      const accountDataStart = await getDexAccountData(roots, dexAccount);

      await dexAccount.methods
        .exchangeV2({
          _callId: getRandomNonce(),
          _operation: operation,
          _expected: expected,
          _roots: roots,
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const accountDataEnd = await getDexAccountData(roots, dexAccount);

      roots.forEach((root, i) => {
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong balances`,
        );
      });
    });
  });

  describe("Withdraw liquidity", () => {
    it("Check DexStablePair withdraw liquidity", async () => {
      await transferWrapper(owner.address, dexAccount.address, 0, [
        {
          root: poolsData.stablePair.lp.address,
          amount: new BigNumber(1).shiftedBy(LP_DECIMALS).toString(),
        },
      ]);

      const gas = await getWithdrawLiquidityGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdrawLiquidity({
            call_id: getRandomNonce(),
            lp_amount: lpAmount,
            lp_root: poolsData.stablePair.lp.address,
            left_root: poolsData.stablePair.roots[0].address,
            right_root: poolsData.stablePair.roots[1].address,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidity", poolsData.stablePair.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .minus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i])
            .plus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
        );
      });
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });

    it("Check DexStablePair withdraw liquidity, expectedAmount > received amount (revert)", async () => {
      const gas = await getWithdrawLiquidityGas(2);

      const poolDataStart = await getPoolData(poolsData.stablePair.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePair.contract,
        lpAmount,
      );
      expected.amounts[poolsData.stablePair.roots[0].address.toString()] =
        new BigNumber(
          expected.amounts[poolsData.stablePair.roots[0].address.toString()],
        )
          .plus(1)
          .toString();

      await dexAccount.methods
        .withdrawLiquidityV2({
          _callId: getRandomNonce(),
          _operation: {
            amount: lpAmount,
            root: poolsData.stablePair.lp.address,
          },
          _expected: poolsData.stablePair.roots.map(root => {
            return {
              root: root.address,
              amount: expected.amounts[root.address.toString()],
            };
          }),
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePair.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePair.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePair.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePair.tokens[i]} balances`,
        );
      });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });

    it("Check DexStablePool withdraw liquidity", async () => {
      await transferWrapper(owner.address, dexAccount.address, 0, [
        {
          root: poolsData.stablePool.lp.address,
          amount: new BigNumber(1).shiftedBy(LP_DECIMALS).toString(),
        },
      ]);

      const gas = await getWithdrawLiquidityGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdrawLiquidityV2({
            _callId: getRandomNonce(),
            _operation: {
              amount: lpAmount,
              root: poolsData.stablePool.lp.address,
            },
            _expected: poolsData.stablePool.roots.map(root => {
              return {
                root: root.address,
                amount: expected.amounts[root.address.toString()],
              };
            }),
            _remainingGasTo: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots.forEach((root, i) => {
        expect(
          new BigNumber(poolDataStart.balances[root.address.toString()])
            .minus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(
          new BigNumber(accountDataStart[i])
            .plus(expected.amounts[root.address.toString()])
            .toString(),
        ).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
        );
      });
      expect(
        new BigNumber(poolDataStart.lpSupply).minus(lpAmount).toString(),
      ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
    });

    it("Check DexStablePool withdraw liquidity, expectedAmount > received amount (revert)", async () => {
      const gas = await getWithdrawLiquidityGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();

      const expected = await expectedWithdrawLiquidity(
        poolsData.stablePool.contract,
        lpAmount,
      );
      expected.amounts[poolsData.stablePool.roots[0].address.toString()] =
        new BigNumber(
          expected.amounts[poolsData.stablePool.roots[0].address.toString()],
        )
          .plus(1)
          .toString();

      await dexAccount.methods
        .withdrawLiquidityV2({
          _callId: getRandomNonce(),
          _operation: {
            amount: lpAmount,
            root: poolsData.stablePool.lp.address,
          },
          _expected: poolsData.stablePool.roots.map(root => {
            return {
              root: root.address,
              amount: expected.amounts[root.address.toString()],
            };
          }),
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );

      poolsData.stablePool.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
        );
      });
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });

    it("Withdraw liquidity from non-exists pool", async () => {
      const gas = await getWithdrawLiquidityGas(2);

      const expected = [
        { root: poolsData.stablePair.roots[0].address, amount: "0" },
        { root: poolsData.stablePool.roots[2].address, amount: "0" },
      ];

      const accountDataStart = await getDexAccountData(
        expected.map(root => root.root),
        dexAccount,
      );

      await dexAccount.methods
        .withdrawLiquidityV2({
          _callId: getRandomNonce(),
          _operation: {
            amount: "1000000",
            root: poolsData.stablePair.lp.address,
          },
          _expected: expected,
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const accountDataEnd = await getDexAccountData(
        expected.map(root => root.root),
        dexAccount,
      );

      expected
        .map(root => root.root)
        .forEach((root, i) => {
          expect(accountDataStart[i]).to.equal(
            accountDataEnd[i],
            `Account has wrong balances`,
          );
        });
    });
  });

  describe("Withdraw liquidity one coin", () => {
    it("Check DexStablePool withdraw liquidity one coin", async () => {
      const gas = await getWithdrawLiquidityGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();
      const receivedTokenAddress = poolsData.stablePool.roots[0].address;

      const expected = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        lpAmount,
        receivedTokenAddress,
      );

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdrawLiquidityOneCoin({
            _callId: getRandomNonce(),
            _operation: {
              amount: lpAmount,
              root: poolsData.stablePool.lp.address,
            },
            _expected: {
              amount: expected.receivedAmount,
              root: receivedTokenAddress,
            },
            _roots: poolsData.stablePool.roots.map(root => root.address),
            _remainingGasTo: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );
      expect(traceTree)
        .to.emit("WithdrawLiquidityV2", poolsData.stablePool.contract)
        .count(1);

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      expect(new BigNumber(accountLpStart).minus(lpAmount).toString()).to.equal(
        accountLpEnd,
        `Account has wrong LP balance`,
      );
      expect(
        new BigNumber(accountDataStart[0])
          .plus(expected.receivedAmount)
          .toString(),
      ).to.equal(accountDataEnd[0], `Account has wrong received token balance`);
      expect(
        new BigNumber(poolDataStart.balances[receivedTokenAddress.toString()])
          .minus(expected.receivedAmount)
          .toString(),
      ).to.equal(
        poolDataEnd.balances[receivedTokenAddress.toString()],
        `Pool has wrong received token balance`,
      );
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

    it("Check DexStablePool withdraw liquidity one coin, expectedAmount > received amount (revert)", async () => {
      const gas = await getWithdrawLiquidityGas(3);

      const poolDataStart = await getPoolData(poolsData.stablePool.contract);
      const accountDataStart = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();
      const receivedTokenAddress = poolsData.stablePool.roots[0].address;

      const expected = await expectedWithdrawLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        lpAmount,
        receivedTokenAddress,
      );

      await dexAccount.methods
        .withdrawLiquidityOneCoin({
          _callId: getRandomNonce(),
          _operation: {
            amount: lpAmount,
            root: poolsData.stablePool.lp.address,
          },
          _expected: {
            amount: new BigNumber(expected.receivedAmount).plus(1).toString(),
            root: receivedTokenAddress,
          },
          _roots: poolsData.stablePool.roots.map(root => root.address),
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      const accountDataEnd = await getDexAccountData(
        poolsData.stablePool.roots.map(root => root.address),
        dexAccount,
      );
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      poolsData.stablePool.roots.forEach((root, i) => {
        expect(poolDataStart.balances[root.address.toString()]).to.equal(
          poolDataEnd.balances[root.address.toString()],
          `Pool has wrong ${poolsData.stablePool.tokens[i]} balance`,
        );
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong ${poolsData.stablePool.tokens[i]} balances`,
        );
      });
      expect(accountLpStart).to.equal(
        accountLpEnd,
        `Account has wrong LP balances`,
      );
      expect(poolDataStart.lpSupply).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
    });

    it("Withdraw liquidity one coin from non-exists pool", async () => {
      const gas = await getWithdrawLiquidityGas(2);

      const roots = [
        poolsData.stablePair.roots[0].address,
        poolsData.stablePool.roots[2].address,
      ];

      const accountDataStart = await getDexAccountData(roots, dexAccount);
      const accountLpStart = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      const lpAmount = new BigNumber(1).shiftedBy(LP_DECIMALS - 3).toString();
      const receivedTokenAddress = roots[0];

      await dexAccount.methods
        .withdrawLiquidityOneCoin({
          _callId: getRandomNonce(),
          _operation: {
            amount: lpAmount,
            root: poolsData.stablePair.lp.address,
          },
          _expected: { amount: "0", root: receivedTokenAddress },
          _roots: poolsData.stablePool.roots.map(root => root.address),
          _remainingGasTo: owner.address,
        })
        .send({ from: owner.address, amount: calcValue(gas) });

      const accountDataEnd = await getDexAccountData(roots, dexAccount);
      const accountLpEnd = (
        await getDexAccountData([poolsData.stablePool.lp.address], dexAccount)
      )[0];

      roots.forEach((root, i) => {
        expect(accountDataStart[i]).to.equal(
          accountDataEnd[i],
          `Account has wrong balances`,
        );
      });
      expect(accountLpStart).to.equal(
        accountLpEnd,
        `Account has wrong LP balances`,
      );
    });
  });
});
