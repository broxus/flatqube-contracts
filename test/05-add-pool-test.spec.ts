import { expect } from "chai";
import { Contract, zeroAddress } from "locklift";
import { Account } from "locklift/everscale-client";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
} from "../build/factorySource";
import { calcValue } from "../utils/gas.utils";

describe("Check DexAccount add Pair", () => {
  let pair: Contract<DexPairAbi>;
  let stablePair: Contract<DexStablePairAbi>;
  let stablePool: Contract<DexStablePoolAbi>;
  let dexAccount: Contract<DexAccountAbi>;
  let owner: Account;
  let gasValues: Contract<DexGasValuesAbi>;

  const pairRoots = ["token-9-0", "token-9-1"];
  const stablePairRoots = ["token-6-0", "token-9-0"];
  const stablePoolRoots = ["token-6-0", "token-9-0", "token-18-0"];

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-pairs", "dex-accounts"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;

    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");

    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
    pair = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_" + pairRoots.join("_"),
    );
    stablePair = locklift.deployments.getContract<DexStablePairAbi>(
      "DexStablePair_" + stablePairRoots.join("_"),
    );
    stablePool = locklift.deployments.getContract<DexStablePoolAbi>(
      "DexStablePool_" + stablePoolRoots.join("_"),
    );
  });

  describe("Add new DexPair to DexAccount", () => {
    it("Check DexPair in DexAccount", async () => {
      const gas = await gasValues.methods
        .getAddPoolGas({ N: 2 })
        .call()
        .then(a => a.value0);

      const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .addPair({ left_root: roots.left, right_root: roots.right })
          .send({ from: owner.address, amount: calcValue(gas) }),
        {
          allowedCodes: {
            contracts: {
              [dexAccount.address.toString()]: {
                compute: [100], // returned gas remaining from token wallets deployment
              },
            },
          },
        },
      );
      expect(traceTree)
        .to.emit("AddPool", dexAccount)
        .withNamedArgs({
          roots: [roots.left, roots.right],
        });

      const leftRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.left })
        .call()
        .then(r => r.wallet);

      const rightRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.right })
        .call()
        .then(r => r.wallet);

      const lpRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.lp })
        .call()
        .then(r => r.wallet);

      expect(leftRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for LeftRoot is empty",
      );
      expect(rightRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for RightRoot is empty",
      );
      expect(lpRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for LPRoot is empty",
      );
    });
  });

  describe("Add new DexStablePair to DexAccount", () => {
    it("Check DexStablePair in DexAccount", async () => {
      const gas = await gasValues.methods
        .getAddPoolGas({ N: 2 })
        .call()
        .then(a => a.value0);

      const roots = await stablePair.methods
        .getTokenRoots({ answerId: 0 })
        .call();
      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .addPair({ left_root: roots.left, right_root: roots.right })
          .send({ from: owner.address, amount: calcValue(gas) }),
        {
          allowedCodes: {
            contracts: {
              [dexAccount.address.toString()]: {
                compute: [100], // returned gas remaining from token wallets deployment
              },
            },
          },
        },
      );
      expect(traceTree)
        .to.emit("AddPool", dexAccount)
        .withNamedArgs({
          roots: [roots.left, roots.right],
        });

      const leftRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.left })
        .call()
        .then(r => r.wallet);

      const rightRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.right })
        .call()
        .then(r => r.wallet);

      const lpRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.lp })
        .call()
        .then(r => r.wallet);

      expect(leftRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for LeftRoot is empty",
      );
      expect(rightRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for RightRoot is empty",
      );
      expect(lpRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for LPRoot is empty",
      );
    });
  });

  describe("Add new DexStablePool to DexAccount", () => {
    it("Check DexStablePool in DexAccount", async () => {
      const gas = await gasValues.methods
        .getAddPoolGas({ N: stablePoolRoots.length })
        .call()
        .then(a => a.value0);

      const roots = await stablePool.methods
        .getTokenRoots({ answerId: 0 })
        .call();
      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .addPool({ _roots: roots.roots })
          .send({ from: owner.address, amount: calcValue(gas) }),
        {
          allowedCodes: {
            contracts: {
              [dexAccount.address.toString()]: {
                compute: [100], // returned gas remaining from token wallets deployment
              },
            },
          },
        },
      );
      expect(traceTree).to.emit("AddPool", dexAccount).withNamedArgs({
        roots: roots.roots,
      });

      const walletsData = await Promise.all(
        roots.roots.map(root =>
          dexAccount.methods
            .getWalletData({ answerId: 0, token_root: root })
            .call(),
        ),
      );

      walletsData.forEach((data, id) =>
        expect(data.wallet).to.not.equal(
          zeroAddress,
          "DexAccount wallet address for tokenRoot is empty",
        ),
      );

      const lpRootWallet = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: roots.lp })
        .call()
        .then(r => r.wallet);

      expect(lpRootWallet).to.not.equal(
        zeroAddress,
        "DexAccount wallet address for LPRoot is empty",
      );
    });
  });
});
