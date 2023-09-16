import { expect } from "chai";
import { Contract } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";
import { Account } from "everscale-standalone-client";
import { createDexPair, createStablePool } from "../../utils/deploy.utils";
import { addressComparator } from "../../utils/helpers";

describe("Check deployment events", () => {
  let owner: Account;

  let dexRoot: Contract<DexRootAbi>;

  before("Load contracts", async () => {
    await locklift.deployments.fixture({ include: ["dex-root", "tokens"] });
    owner = locklift.deployments.getAccount("DexOwner").account;
  });

  describe("Check pools", () => {
    it("Check DexPair's deployment events", async () => {
      const left =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          "token-6-0",
        ).address;
      const right =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          "token-18-0",
        ).address;

      const { traceTree } = await locklift.tracing.trace(
        await createDexPair(left, right).then(a => a.tx),
      );
      expect(traceTree)
        .to.emit("NewTokenVaultCreated", dexRoot)
        .withNamedArgs({ tokenRoot: left })
        .and.to.emit("NewTokenVaultCreated", dexRoot)
        .withNamedArgs({ tokenRoot: right })
        .and.emit("VaultTokenWalletDeployed")
        .count(3) // 2 root tokens + lp token
        .and.emit("NewPoolCreated", dexRoot)
        .withNamedArgs({
          roots: [left, right].sort((a, b) => addressComparator(a, b)),
        });
    });

    it("Check DexStablePool's deployment events", async () => {
      const roots = [
        locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-1")
          .address,
        locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-9-1")
          .address,
        locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-18-1")
          .address,
      ];

      const { traceTree } = await locklift.tracing.trace(
        await createStablePool(roots).then(a => a.tx),
      );
      expect(traceTree)
        .to.emit("NewTokenVaultCreated", dexRoot)
        .withNamedArgs({ tokenRoot: roots[0] })
        .and.to.emit("NewTokenVaultCreated", dexRoot)
        .withNamedArgs({ tokenRoot: roots[1] })
        .and.to.emit("NewTokenVaultCreated", dexRoot)
        .withNamedArgs({ tokenRoot: roots[2] })
        .and.emit("VaultTokenWalletDeployed")
        .count(4) // 3 root tokens + lp token
        .and.emit("NewPoolCreated", dexRoot)
        .withNamedArgs({
          roots: roots.sort((a, b) => addressComparator(a, b)),
        });
    });
  });
});
