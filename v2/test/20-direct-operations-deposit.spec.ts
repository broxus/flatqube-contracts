import { expect } from "chai";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../../utils/gas.utils";
import { getPoolData, depositLiquidity } from "../../utils/wrappers";
import BigNumber from "bignumber.js";
import {
  expectedDepositLiquidity,
  expectedDepositLiquidityOneCoin,
  getFeesFromTotalFee,
} from "../../utils/expected.utils";
import { getWallet } from "../../utils/wrappers";

describe("Check direct operations", () => {
  let owner: Account;
  let gasValues: Contract<DexGasValuesAbi>;
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
  //pooltype: 1 - dexpair, 2 - dexstablepair, 3 - stablePool
  //n - количество токенов в паре/пуле
  async function getPoolDepositGas(N: number, poolType: number) {
    return gasValues.methods
      .getPoolDirectDepositGas({
        N: N,
        referrer: zeroAddress,
        poolType: poolType,
        deployWalletValue: toNano(0.1),
      })
      .call()
      .then(a => a.value0);
  }

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-pairs", "dex-gas-values"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;
    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

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

    // initial deposit liquidity to pools

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
  describe("Direct deposit to pair v1", () => {
    for (let tokenIndex of [0, 1]) {
      it(`Deposit Token${tokenIndex + 1} to DexPair`, async () => {
        const tokenRoot = poolsData.pair.roots[tokenIndex];
        const otherTokenRoot = poolsData.pair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolDepositGas(2, 1);
        const poolDataStart = await getPoolData(poolsData.pair.contract);

        const amount = new BigNumber(1)
          .shiftedBy(tokensData[tokenRoot.toString()].decimals)
          .toString();

        const expected = await expectedDepositLiquidity(
          poolsData.pair.contract,
          [
            {
              root: tokenRoot,
              amount: amount,
            },
            {
              root: otherTokenRoot,
              amount: "0",
            },
          ],
          true,
        );
        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const otherTokenWallet = await getWallet(
          owner.address,
          otherTokenRoot,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.pair.contract as Contract<DexPairAbi>
        ).methods
          .buildDepositLiquidityPayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
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
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );
        expect(traceTree)
          .to.emit("DepositLiquidity", poolsData.pair.contract)
          .count(1)
          .to.emit("Exchange", poolsData.pair.contract)
          .count(1);

        const poolDataEnd = await getPoolData(poolsData.pair.contract);
        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(amount)
            .minus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOtherTokensChange =
          traceTree?.tokens.getTokenBalanceChange(otherTokenWallet);

        expect(accountTokensChange).to.equal(
          (-amount).toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        expect(accountOtherTokensChange).to.equal("0");
        expect(
          new BigNumber(poolDataStart.lpSupply)
            .plus(expected.lpReward)
            .toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }

    for (let tokenIndex of [0, 1]) {
      it(`Deposit Token${tokenIndex + 1} to DexStablePair`, async () => {
        const tokenRoot = poolsData.stablePair.roots[tokenIndex];
        const otherTokenRoot = poolsData.stablePair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolDepositGas(2, 2);

        const poolDataStart = await getPoolData(poolsData.stablePair.contract);

        const amount = new BigNumber(1)
          .shiftedBy(tokensData[tokenRoot.toString()].decimals)
          .toString();

        const expected = await expectedDepositLiquidity(
          poolsData.stablePair.contract,
          [
            {
              root: tokenRoot,
              amount: amount,
            },
            {
              root: otherTokenRoot,
              amount: "0",
            },
          ],
          false,
        );
        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const otherTokenWallet = await getWallet(
          owner.address,
          otherTokenRoot,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.stablePair.contract as Contract<DexStablePairAbi>
        ).methods
          .buildDepositLiquidityPayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
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
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );

        expect(traceTree)
          .to.emit("DepositLiquidity", poolsData.stablePair.contract)
          .count(1)
          .to.emit("Exchange", poolsData.stablePair.contract)
          .count(1);

        const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(amount)
            .minus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOtherTokensChange =
          traceTree?.tokens.getTokenBalanceChange(otherTokenWallet);

        expect(accountTokensChange).to.equal(
          (-amount).toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        expect(accountOtherTokensChange).to.equal("0");

        expect(
          new BigNumber(poolDataStart.lpSupply)
            .plus(expected.lpReward)
            .toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }
  });

  describe("Direct deposit to pair v2", () => {
    for (let tokenIndex of [0, 1]) {
      it(`Deposit Token${tokenIndex + 1} to DexPair`, async () => {
        const tokenRoot = poolsData.pair.roots[tokenIndex];
        const otherTokenRoot = poolsData.pair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolDepositGas(2, 1);
        const poolDataStart = await getPoolData(poolsData.pair.contract);

        const amount = new BigNumber(1)
          .shiftedBy(tokensData[tokenRoot.toString()].decimals)
          .toString();

        const expected = await expectedDepositLiquidity(
          poolsData.pair.contract,
          [
            {
              root: tokenRoot,
              amount: amount,
            },
            {
              root: otherTokenRoot,
              amount: "0",
            },
          ],
          true,
        );
        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const otherTokenWallet = await getWallet(
          owner.address,
          otherTokenRoot,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.pair.contract as Contract<DexPairAbi>
        ).methods
          .buildDepositLiquidityPayloadV2({
            _id: getRandomNonce(),
            _deployWalletGrams: toNano(0.1),
            _expectedAmount: expected.lpReward,
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
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );
        expect(traceTree)
          .to.emit("DepositLiquidity", poolsData.pair.contract)
          .count(1)
          .to.emit("Exchange", poolsData.pair.contract)
          .count(1);

        const poolDataEnd = await getPoolData(poolsData.pair.contract);
        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(amount)
            .minus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        expect(
          new BigNumber(poolDataStart.accumulatedFees[tokenRoot.toString()])
            .plus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.accumulatedFees[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} fees`,
        );

        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOtherTokensChange =
          traceTree?.tokens.getTokenBalanceChange(otherTokenWallet);

        expect(accountTokensChange).to.equal(
          (-amount).toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        expect(accountOtherTokensChange).to.equal("0");
        expect(
          new BigNumber(poolDataStart.lpSupply)
            .plus(expected.lpReward)
            .toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");

        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }

    for (let tokenIndex of [0, 1]) {
      it(`Deposit Token${tokenIndex + 1} to DexStablePair`, async () => {
        const tokenRoot = poolsData.stablePair.roots[tokenIndex];
        const otherTokenRoot = poolsData.stablePair.roots[tokenIndex ? 0 : 1];

        const gas = await getPoolDepositGas(2, 2);

        const poolDataStart = await getPoolData(poolsData.stablePair.contract);

        const amount = new BigNumber(1)
          .shiftedBy(tokensData[tokenRoot.toString()].decimals)
          .toString();

        const expected = await expectedDepositLiquidity(
          poolsData.stablePair.contract,
          [
            {
              root: tokenRoot,
              amount: amount,
            },
            {
              root: otherTokenRoot,
              amount: "0",
            },
          ],
          false,
        );
        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const otherTokenWallet = await getWallet(
          owner.address,
          otherTokenRoot,
        ).then(a => a.walletContract);

        const payload = await (
          poolsData.stablePair.contract as Contract<DexStablePairAbi>
        ).methods
          .buildDepositLiquidityPayloadV2({
            _id: getRandomNonce(),
            _deployWalletGrams: toNano(0.1),
            _expectedAmount: expected.lpReward,
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
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );

        expect(traceTree)
          .to.emit("DepositLiquidity", poolsData.stablePair.contract)
          .count(1)
          .to.emit("Exchange", poolsData.stablePair.contract)
          .count(1);

        const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(amount)
            .minus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        expect(
          new BigNumber(poolDataStart.accumulatedFees[tokenRoot.toString()])
            .plus(expected.beneficiaryFees[tokenRoot.toString()])
            .toString(),
        ).to.equal(
          poolDataEnd.accumulatedFees[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} fees`,
        );

        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOtherTokensChange =
          traceTree?.tokens.getTokenBalanceChange(otherTokenWallet);

        expect(accountTokensChange).to.equal(
          (-amount).toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        expect(accountOtherTokensChange).to.equal("0");

        expect(
          new BigNumber(poolDataStart.lpSupply)
            .plus(expected.lpReward)
            .toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }
  });

  describe("Direct deposit to stable pool", () => {
    for (let tokenIndex of [0, 1, 2]) {
      it(`Deposit Token${tokenIndex + 1} to DexStablePool`, async () => {
        const tokenRoot = poolsData.stablePool.roots[tokenIndex];

        const gas = await getPoolDepositGas(3, 3);
        const poolDataStart = await getPoolData(poolsData.stablePool.contract);

        const amount = new BigNumber(1)
          .shiftedBy(tokensData[tokenRoot.toString()].decimals)
          .toString();

        const expected = await expectedDepositLiquidityOneCoin(
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
          amount.toString(),
          tokenRoot,
        );
        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const othersTokensWallets = await Promise.all(
          poolsData.stablePool.roots
            .filter(v => !v.equals(tokenRoot))
            .map((root, i) =>
              getWallet(owner.address, root).then(a => a.walletContract),
            ),
        );

        const payload = await (
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>
        ).methods
          .buildDepositLiquidityPayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
            expected_amount: expected.lpReward,
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
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );

        expect(traceTree)
          .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
          .count(1);

        const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(amount)
            .minus(expected.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        expect(
          new BigNumber(poolDataStart.accumulatedFees[tokenRoot.toString()])
            .plus(expected.beneficiaryFee)
            .toString(),
        ).to.equal(
          poolDataEnd.accumulatedFees[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} fees`,
        );

        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOthersTokensChange = othersTokensWallets.map(wallet =>
          traceTree?.tokens.getTokenBalanceChange(wallet),
        );

        expect(accountTokensChange).to.equal(
          new BigNumber(amount).multipliedBy(-1).toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        accountOthersTokensChange.forEach(change =>
          expect(String(change)).to.equal("0"),
        );

        expect(
          new BigNumber(poolDataStart.lpSupply)
            .plus(expected.lpReward)
            .toString(),
        ).to.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }

    for (let tokenIndex of [0, 1, 2]) {
      it(`Deposit Token${
        tokenIndex + 1
      } to DexStablePool (expectedSpendAmount)`, async () => {
        const tokenRoot = poolsData.stablePool.roots[tokenIndex];

        const gas = await getPoolDepositGas(3, 3);
        const poolDataStart = await getPoolData(poolsData.stablePool.contract);
        const lpAmount = new BigNumber(1).shiftedBy(9).toString();

        const expectedSpendData = await (
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>
        ).methods
          .expectedDepositSpendAmount({
            lp_amount: lpAmount,
            spent_token_root: tokenRoot,
            answerId: 0,
          })
          .call();

        const tokenWallet = await getWallet(owner.address, tokenRoot).then(
          a => a.walletContract,
        );
        const othersTokensWallets = await Promise.all(
          poolsData.stablePool.roots
            .filter(v => !v.equals(tokenRoot))
            .map((root, i) =>
              getWallet(owner.address, root).then(a => a.walletContract),
            ),
        );

        const payload = await (
          poolsData.stablePool.contract as Contract<DexStablePoolAbi>
        ).methods
          .buildDepositLiquidityPayload({
            id: getRandomNonce(),
            deploy_wallet_grams: toNano(0.1),
            expected_amount: lpAmount,
            recipient: commonAcc.address,
            referrer: zeroAddress,
            success_payload: null,
            cancel_payload: null,
          })
          .call();

        const { traceTree } = await locklift.tracing.trace(
          tokenWallet.methods
            .transfer({
              amount: expectedSpendData.tokens_amount,
              recipient: poolsData.stablePool.contract.address,
              deployWalletValue: 0,
              remainingGasTo: owner.address,
              notify: true,
              payload: payload.value0,
            })
            .send({ from: owner.address, amount: calcValue(gas, true) }),
        );
        expect(traceTree)
          .to.emit("DepositLiquidityV2", poolsData.stablePool.contract)
          .count(1);

        const lpTokenWallet = await getWallet(
          commonAcc.address,
          poolsData.stablePool.lp.address,
        ).then(a => a.walletContract);

        const poolDataEnd = await getPoolData(poolsData.stablePool.contract);

        expect(
          new BigNumber(poolDataStart.balances[tokenRoot.toString()])
            .plus(expectedSpendData.tokens_amount)
            .minus(
              await getFeesFromTotalFee(
                poolsData.stablePool.contract,
                expectedSpendData.expected_fee,
                false,
              ).then(a => a.beneficiaryFee),
            )
            .toString(),
        ).to.equal(
          poolDataEnd.balances[tokenRoot.toString()],
          `Pool has wrong ${tokensData[tokenRoot.toString()].symbol} balance`,
        );
        const accountTokensChange =
          traceTree?.tokens.getTokenBalanceChange(tokenWallet);
        const accountOthersTokensChange = othersTokensWallets.map(wallet =>
          traceTree?.tokens.getTokenBalanceChange(wallet),
        );
        const lpTokensChange =
          traceTree?.tokens.getTokenBalanceChange(lpTokenWallet);

        expect(accountTokensChange).to.equal(
          new BigNumber(expectedSpendData.tokens_amount)
            .multipliedBy(-1)
            .toString(),
          `Account has wrong ${
            tokensData[tokenRoot.toString()].symbol
          } balance`,
        );
        accountOthersTokensChange.forEach(change =>
          expect(String(change)).to.equal("0"),
        );
        expect(Number(lpTokensChange)).to.be.greaterThanOrEqual(
          Number(lpAmount),
        );
        expect(
          new BigNumber(poolDataStart.lpSupply).plus(lpTokensChange).toString(),
        ).to.be.equal(poolDataEnd.lpSupply, "Pool has wrong LP balance");
        expect(poolDataEnd.lpSupply).to.equal(
          poolDataEnd.actualTotalSupply,
          "Pool LP balance is not equal to LP_Root total supply",
        );
      });
    }
  });

  describe("Direct deposit V2, expected_lp_amount > lp_amount (revert)", () => {
    it("Deposit Token1 to DexPair", async () => {
      const tokenRoot = poolsData.pair.roots[0];

      const gas = await getPoolDepositGas(2, 1);
      const poolDataStart = await getPoolData(poolsData.pair.contract);

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const expected = await expectedDepositLiquidity(
        poolsData.pair.contract,
        [
          {
            root: tokenRoot,
            amount: amount,
          },
          {
            root: poolsData.pair.roots[1],
            amount: "0",
          },
        ],
        true,
      );
      const tokensWallets = await Promise.all(
        poolsData.pair.roots.map((root, i) =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.pair.contract as Contract<DexPairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.lpReward).plus(1).toString(),
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokensWallets[0].methods
          .transfer({
            amount: amount,
            recipient: poolsData.pair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.pair.contract);
      expect(
        new BigNumber(poolDataStart.balances[tokenRoot.toString()]).toString(),
      ).to.equal(
        poolDataEnd.balances[tokenRoot.toString()],
        `Pool has wrong ${poolsData.pair.tokens[0]} balance`,
      );

      const accountTokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet),
      );
      accountTokensChange.forEach((change, i) =>
        expect(String(change)).to.equal(
          "0",
          `Account has wrong ${poolsData.stablePair.tokens[i]} balance`,
        ),
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );

      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit Token1 to DexStablePair", async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const gas = await getPoolDepositGas(2, 2);
      const poolDataStart = await getPoolData(poolsData.stablePair.contract);

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals)
        .toString();

      const expected = await expectedDepositLiquidity(
        poolsData.stablePair.contract,
        [
          {
            root: tokenRoot,
            amount: amount,
          },
          {
            root: poolsData.stablePair.roots[1],
            amount: "0",
          },
        ],
        true,
      );
      const tokensWallets = await Promise.all(
        poolsData.stablePair.roots.map((root, i) =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePair.contract as Contract<DexStablePairAbi>
      ).methods
        .buildDepositLiquidityPayloadV2({
          _id: getRandomNonce(),
          _deployWalletGrams: toNano(0.1),
          _expectedAmount: new BigNumber(expected.lpReward).plus(1).toString(),
          _recipient: owner.address,
          _referrer: zeroAddress,
          _cancelPayload: null,
          _successPayload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokensWallets[0].methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePair.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePair.contract);
      expect(
        new BigNumber(poolDataStart.balances[tokenRoot.toString()]).toString(),
      ).to.equal(
        poolDataEnd.balances[tokenRoot.toString()],
        `Pool has wrong ${poolsData.stablePair.tokens[0]} balance`,
      );

      const accountTokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet),
      );
      accountTokensChange.forEach((change, i) =>
        expect(String(change)).to.equal(
          "0",
          `Account has wrong ${poolsData.stablePair.tokens[i]} balance`,
        ),
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });

    it("Deposit Token1 to DexStablePool", async () => {
      const tokenRoot = poolsData.stablePair.roots[0];

      const gas = await getPoolDepositGas(3, 3);
      const poolDataStart = await getPoolData(poolsData.stablePool.contract);

      const amount = new BigNumber(1)
        .shiftedBy(tokensData[tokenRoot.toString()].decimals - 3)
        .toString();

      const expected = await expectedDepositLiquidityOneCoin(
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>,
        amount.toString(),
        tokenRoot,
      );
      const tokensWallets = await Promise.all(
        poolsData.stablePool.roots.map((root, i) =>
          getWallet(owner.address, root).then(a => a.walletContract),
        ),
      );

      const payload = await (
        poolsData.stablePool.contract as Contract<DexStablePoolAbi>
      ).methods
        .buildDepositLiquidityPayload({
          id: getRandomNonce(),
          deploy_wallet_grams: toNano(0.1),
          expected_amount: new BigNumber(expected.lpReward).plus(1).toString(),
          recipient: zeroAddress,
          referrer: zeroAddress,
          success_payload: null,
          cancel_payload: null,
        })
        .call();

      const { traceTree } = await locklift.tracing.trace(
        tokensWallets[0].methods
          .transfer({
            amount: amount,
            recipient: poolsData.stablePool.contract.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: payload.value0,
          })
          .send({ from: owner.address, amount: calcValue(gas, true) }),
      );

      const poolDataEnd = await getPoolData(poolsData.stablePool.contract);
      expect(
        new BigNumber(poolDataStart.balances[tokenRoot.toString()]).toString(),
      ).to.equal(
        poolDataEnd.balances[tokenRoot.toString()],
        `Pool has wrong ${poolsData.stablePool.tokens[0]} balance`,
      );

      const accountTokensChange = tokensWallets.map(wallet =>
        traceTree?.tokens.getTokenBalanceChange(wallet),
      );
      accountTokensChange.forEach((change, i) =>
        expect(String(change)).to.equal(
          "0",
          `Account has wrong ${poolsData.stablePair.tokens[i]} balance`,
        ),
      );

      expect(new BigNumber(poolDataStart.lpSupply).toString()).to.equal(
        poolDataEnd.lpSupply,
        "Pool has wrong LP balance",
      );
      expect(poolDataEnd.lpSupply).to.equal(
        poolDataEnd.actualTotalSupply,
        "Pool LP balance is not equal to LP_Root total supply",
      );
    });
  });
});
