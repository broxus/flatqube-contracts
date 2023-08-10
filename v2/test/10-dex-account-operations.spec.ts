import { expect } from "chai";
import { Contract, getRandomNonce, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../utils/gas.utils";
import { ITokens, transferWrapper } from "../../utils/wrappers";
import BigNumber from "bignumber.js";

const LP_DECIMALS = 9;

describe("Check DexAccount add Pair", () => {
  let owner: Account;
  let dexAccount: Contract<DexAccountAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let poolsData: Record<
    string,
    {
      contract:
        | Contract<DexPairAbi>
        | Contract<DexStablePairAbi>
        | Contract<DexStablePoolAbi>;
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
      .getAccountDepositGas({ N: N, referrer: zeroAddress })
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
    poolsData.pair.contract = locklift.deployments.getContract<DexPairAbi>(
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

    // add pools to DexAccount + transfer to dexAccount
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
    });

    it("Deposit unequal amounts of tokens to DexStablePool (revert)", async () => {
      const gas = await getDepositGas(3);

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
    });

    it("Initial deposit to DexPair", async () => {
      const gas = await getDepositGas(2);

      const amounts = poolsData.pair.roots.map(root =>
        new BigNumber(1)
          .shiftedBy(tokensData[root.address.toString()].decimals)
          .toString(),
      );
      const expectedLpAmount = BigNumber.max(...amounts).toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: poolsData.pair.roots[0].address,
            left_amount: amounts[0],
            right_root: poolsData.pair.roots[1].address,
            right_amount: amounts[1],
            expected_lp_root: poolsData.pair.lp.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .withNamedArgs({
          lp: expectedLpAmount,
        });
    });

    it("Initial deposit to DexStablePair", async () => {
      const gas = await getDepositGas(2);

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
    });

    it("Initial deposit to DexStablePool", async () => {
      const gas = await getDepositGas(3);

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
    });
  });

  describe("Deposit to pool", () => {
    it("Deposit to DexPair, auto_change = false", async () => {
      const gas = await getDepositGas(2);

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(
            tokensData[poolsData.pair.roots[i].address.toString()].decimals - 3,
          )
          .toString(),
      );
      // const expectedLpAmount = ;

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: poolsData.pair.roots[0].address,
            left_amount: amounts[0],
            right_root: poolsData.pair.roots[1].address,
            right_amount: amounts[1],
            expected_lp_root: poolsData.pair.lp.address,
            auto_change: false,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(1)
        //   .withNamedArgs({
        //     lp: expectedLpAmount,
        //   });
        .and.call("internalPoolTransfer", dexAccount.address)
        .withNamedArgs({
          _tokenRoot: poolsData.pair.roots[1].address,
        });
    });

    it("Deposit to DexPair, auto_change = true", async () => {
      const gas = await getDepositGas(2);

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(
            tokensData[poolsData.pair.roots[i].address.toString()].decimals - 3,
          )
          .toString(),
      );
      // const expectedLpAmount = ;

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .depositLiquidity({
            call_id: getRandomNonce(),
            left_root: poolsData.pair.roots[0].address,
            left_amount: amounts[0],
            right_root: poolsData.pair.roots[1].address,
            right_amount: amounts[1],
            expected_lp_root: poolsData.pair.lp.address,
            auto_change: true,
            send_gas_to: owner.address,
          })
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidity", poolsData.pair.contract)
        .count(2)
        .to.emit("Exchange", poolsData.pair.contract)
        .count(1);
    });

    it("Deposit to DexStablePair", async () => {
      const gas = await getDepositGas(2);

      const amounts = [1, 2].map((amount, i) =>
        new BigNumber(amount)
          .shiftedBy(
            tokensData[poolsData.stablePair.roots[i].address.toString()]
              .decimals - 3,
          )
          .toString(),
      );
      // const expectedLpAmount = ;

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
    });

    it("Deposit to DexStablePool", async () => {
      const gas = await getDepositGas(3);

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
      // const expectedLpAmount = ;

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
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
          .send({ from: owner.address, amount: calcValue(gas) }),
      );

      expect(traceTree)
        .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
        .withNamedArgs({
          // lp: expectedLpAmount,
        });
    });

    it("Deposit to non-exists pool", async () => {
      const gas = await getDepositGas(2);

      const operations = [
        { root: poolsData.pair.roots[1].address, amount: "100000" },
        { root: poolsData.stablePair.roots[0].address, amount: "100000" },
      ];

      await dexAccount.methods
        .depositLiquidityV2({
          _callId: getRandomNonce(),
          _operations: operations,
          _expected: {
            amount: 0,
            root: poolsData.pair.lp.address,
          },
          _autoChange: true,
          _remainingGasTo: owner.address,
          _referrer: zeroAddress,
        })
        .send({ from: owner.address, amount: calcValue(gas) });
    });
  });

  describe("Exchange", () => {
    it("Check DexPair exchange", async () => {});
  });

  describe("Withdraw liquidity", () => {
    it("Check withdraw liquidity in case of zero account lp_balance", async () => {});
  });

  describe("Withdraw liquidity one coin", () => {
    it("Check DexStablePool withdraw liquidity one coin", async () => {});
  });
});
