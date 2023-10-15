import { expect } from "chai";
import { Contract } from "locklift";
import {
  DexRootAbi,
  DexVaultAbi,
  TokenFactoryAbi,
} from "../build/factorySource";

describe("Check for correct deployment", () => {

  let dexRoot: Contract<DexRootAbi>;
  let dexVault: Contract<DexVaultAbi>;
  let tokenFactory: Contract<TokenFactoryAbi>;

  before("Load contracts", async () => {
    await locklift.deployments.fixture({ include: ["dex-root"] });

    tokenFactory =
      locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
  });

  describe("Check DexRoot", () => {
    it("Check DexRoot deployed", async () => {
      const isDeployed = await dexRoot
        .getFullState()
        .then(s => s.state.isDeployed);

      return expect(isDeployed).to.be.true;
    });

    it("Check Platform code is installed (DexRoot)", async () => {
      const DexPlatform = locklift.factory.getContractArtifacts("DexPlatform");

      const platformCode = await dexRoot.methods
        .platform_code()
        .call()
        .then(c => c.platform_code);

      return expect(platformCode).to.equal(
        DexPlatform.code,
        "Wrong platform code in DexRoot",
      );
    });

    it("Check Account code is installed", async () => {
      const DexAccount = locklift.factory.getContractArtifacts("DexAccount");

      const accountCode = await dexRoot.methods
        .getAccountCode({ answerId: 0 })
        .call()
        .then(c => c.value0);

      return expect(accountCode).to.equal(
        DexAccount.code,
        "Wrong Account code in DexRoot",
      );
    });

    it("Check Pair code is installed", async () => {
      const DexPair = locklift.factory.getContractArtifacts("DexPair");

      const pairCode = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call()
        .then(c => c.value0);

      return expect(pairCode).to.equal(
        DexPair.code,
        "Wrong Pair code in DexRoot",
      );
    });

    it("Check StablePair code is installed", async () => {
      const DexStablePair =
        locklift.factory.getContractArtifacts("DexStablePair");

      const stablePairCode = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 2 })
        .call()
        .then(c => c.value0);

      return expect(stablePairCode).to.equal(
        DexStablePair.code,
        "Wrong StablePair code in DexRoot",
      );
    });

    it("Check StablePool code is installed", async () => {
      const DexStablePool =
        locklift.factory.getContractArtifacts("DexStablePool");

      const stablePoolCode = await dexRoot.methods
        .getPoolCode({ answerId: 0, pool_type: 3 })
        .call()
        .then(c => c.value0);

      return expect(stablePoolCode).to.equal(
        DexStablePool.code,
        "Wrong StablePool code in DexRoot",
      );
    });

    it("Check LpTokenPending code is installed", async () => {
      const LpTokenPending =
        locklift.factory.getContractArtifacts("LpTokenPending");

      const lpTokenPendingCode = await dexRoot.methods
        .getLpTokenPendingCode({ answerId: 0 })
        .call()
        .then(c => c.value0);

      return expect(lpTokenPendingCode).to.equal(
        LpTokenPending.code,
        "Wrong LpTokenPending code in DexRoot",
      );
    });

    it("Check TokenVault code is installed", async () => {
      const DexTokenVault =
        locklift.factory.getContractArtifacts("DexTokenVault");

      const vaultCode = await dexRoot.methods
        .getTokenVaultCode({ answerId: 0 })
        .call()
        .then(c => c.value0);

      return expect(vaultCode).to.equal(
        DexTokenVault.code,
        "Wrong TokenVault code in DexRoot",
      );
    });

    it("Check Vault address", async () => {
      const vault = await dexRoot.methods
        .getVault({ answerId: 0 })
        .call()
        .then(v => v.value0.toString());

      expect(vault).to.equal(
        dexVault.address.toString(),
        "Wrong DexVault address in DexRoot",
      );
    });

    it("Check TokenFactory address", async () => {
      const factory = await dexRoot.methods
        .getTokenFactory({ answerId: 0 })
        .call()
        .then(v => v.value0.toString());

      expect(factory).to.equal(
        tokenFactory.address.toString(),
        "Wrong TokenFactory address in DexRoot",
      );
    });

    it("Check is Dex Active", async () => {
      const isActive = await dexRoot.methods
        .isActive({ answerId: 0 })
        .call()
        .then(a => a.value0);

      expect(isActive).to.be.true;
    });
  });

  describe("Check DexVault", () => {
    it("Check DexVault deployed", async () => {
      const isDeployed = await dexVault
        .getFullState()
        .then(s => s.state.isDeployed);

      return expect(isDeployed).to.be.true;
    });

    it("Check Platform code is installed (DexVault)", async () => {
      const DexPlatform = locklift.factory.getContractArtifacts("DexPlatform");

      const platformCode = await dexVault.methods
        .platform_code()
        .call()
        .then(c => c.platform_code);

      return expect(platformCode).to.equal(
        DexPlatform.code,
        "Wrong platform code in DexVault",
      );
    });

    it("Check Root address", async () => {
      const root = await dexVault.methods
        .getRoot({ answerId: 0 })
        .call()
        .then(r => r.value0.toString());

      return expect(root).to.equal(
        dexRoot.address.toString(),
        "Wrong DexRoot address in DexVault",
      );
    });
  });
});
