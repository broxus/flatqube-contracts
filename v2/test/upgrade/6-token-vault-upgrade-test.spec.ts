import { expect } from "chai";

import { Contract } from "locklift";
import {
  DexTokenVaultAbi,
  TestNewDexTokenVaultAbi,
  TokenRootUpgradeableAbi,
} from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";
import {
  getExpectedTokenVaultAddress,
  setWeverInDexTokenVault,
} from "../../../utils/wrappers";
import { upgradeTokenVault } from "../../../utils/upgrade.utils";

interface ITokenVaultData {
  root: string;
  currentVersion: number;
  platformCode: string;
  tokenRoot: string;
  tokenWallet: string;
  vault: string;
  weverTokenRoot: string;
  targetBalance: string;
}

const loadTokenVaultData = async (
  tokenVault: Contract<DexTokenVaultAbi> | Contract<TestNewDexTokenVaultAbi>,
) => {
  const data: ITokenVaultData = {} as ITokenVaultData;

  data.root = await tokenVault.methods
    .getDexRoot({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.currentVersion = await tokenVault.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => Number(a.value0));

  data.platformCode = await tokenVault.methods
    .getPlatformCode({ answerId: 0 })
    .call()
    .then(a => a.value0);

  data.tokenRoot = await tokenVault.methods
    .getTokenRoot({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.tokenWallet = await tokenVault.methods
    .getTokenWallet({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.vault = await tokenVault.methods
    .getVault({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.weverTokenRoot = await tokenVault.methods
    .getWeverVaultTokenRoot({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.targetBalance = await tokenVault.methods
    .getTargetBalance({ answerId: 0 })
    .call()
    .then(a => a.value0);

  return data;
};

describe("Test DexTokenVault contract upgrade", async function () {
  let NewDexTokenVaultData: ContractData<TestNewDexTokenVaultAbi>;

  let owner: Account;
  let dexTokenVault: Contract<DexTokenVaultAbi>;
  let newDexTokenVault: Contract<TestNewDexTokenVaultAbi>;

  let oldTokenVaultData: ITokenVaultData = {} as ITokenVaultData;
  let newTokenVaultData: ITokenVaultData = {} as ITokenVaultData;

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-root", "wever", "dex-pairs-wever"],
    });

    const token =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-0");

    owner = locklift.deployments.getAccount("DexOwner").account;
    dexTokenVault = locklift.factory.getDeployedContract(
      "DexTokenVault",
      await getExpectedTokenVaultAddress(token.address),
    );
    NewDexTokenVaultData = await locklift.factory.getContractArtifacts(
      "TestNewDexTokenVault",
    );

    await setWeverInDexTokenVault(token.address);

    oldTokenVaultData = await loadTokenVaultData(dexTokenVault);

    await upgradeTokenVault(token.address, NewDexTokenVaultData);

    newDexTokenVault = locklift.factory.getDeployedContract(
      "TestNewDexTokenVault",
      dexTokenVault.address,
    );
    newTokenVaultData = await loadTokenVaultData(newDexTokenVault);
  });

  describe("Check DexTokenVault after upgrade", async function () {
    it("Check New Function", async function () {
      expect(
        (await newDexTokenVault.methods.newFunc().call()).value0.toString(),
      ).to.equal("New Token Vault", "DexTokenVault new function incorrect");
    });
    it("Check All data correct installed in new contract", async function () {
      expect(newTokenVaultData.root).to.equal(
        oldTokenVaultData.root,
        "New root value incorrect",
      );
      expect(newTokenVaultData.platformCode).to.equal(
        oldTokenVaultData.platformCode,
        "New platformCode value incorrect",
      );
      expect(newTokenVaultData.currentVersion).to.equal(
        oldTokenVaultData.currentVersion + 1,
        "New currentVersion value incorrect",
      );
      expect(newTokenVaultData.tokenRoot).to.equal(
        oldTokenVaultData.tokenRoot,
        "New tokenRoot value incorrect",
      );
      expect(newTokenVaultData.tokenWallet).to.equal(
        oldTokenVaultData.tokenWallet,
        "New tokenWallet value incorrect",
      );
      expect(newTokenVaultData.vault).to.equal(
        oldTokenVaultData.vault,
        "New vault value incorrect",
      );
      expect(newTokenVaultData.weverTokenRoot).to.equal(
        oldTokenVaultData.weverTokenRoot,
        "New wever token root value incorrect",
      );
      expect(newTokenVaultData.targetBalance).to.equal(
        oldTokenVaultData.targetBalance,
        "New targetBalance value incorrect",
      );
    });
  });
});
