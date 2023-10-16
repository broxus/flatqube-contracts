import { expect } from "chai";

import { Contract, toNano } from "locklift";
import { DexVaultAbi, TestNewDexVaultAbi } from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";

interface IVaultData {
  root: string;
  owner: string;
  pending_owner: string;
  platform_code: string;
  projectId: string;
  projectAddress: string;
}

const loadVaultData = async (
  vault: Contract<DexVaultAbi> | Contract<TestNewDexVaultAbi>,
) => {
  const data: IVaultData = {} as IVaultData;

  data.platform_code = await vault.methods
    .platform_code()
    .call()
    .then(a => a.platform_code);

  data.root = await vault.methods
    .getRoot({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.owner = await vault.methods
    .getOwner({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());
  data.pending_owner = await vault.methods
    .getPendingOwner({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  const referralProgramParams = await vault.methods
    .getReferralProgramParams({ answerId: 0 })
    .call()
    .then(a => a.value0);
  data.projectId = referralProgramParams.projectId.toString();
  data.projectAddress = referralProgramParams.projectAddress.toString();

  return data;
};

describe("Test Dex Vault contract upgrade", async function () {
  let NewDexVaultCode: ContractData<TestNewDexVaultAbi>;

  let owner: Account;
  let dexVault: Contract<DexVaultAbi>;
  let newDexVault: Contract<TestNewDexVaultAbi>;

  let oldVaultData: IVaultData = {} as IVaultData;
  let newVaultData: IVaultData = {} as IVaultData;

  before("Load contracts", async function () {
    await locklift.deployments.fixture({ include: ["dex-root"] });

    owner = locklift.deployments.getAccount("DexOwner").account;
    dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

    NewDexVaultCode = await locklift.factory.getContractArtifacts(
      "TestNewDexVault",
    );
    oldVaultData = await loadVaultData(dexVault);
    console.log(
      `Old Vault(${dexVault.address}) data:\n${JSON.stringify(
        oldVaultData,
        null,
        4,
      )}`,
    );

    console.log(`Upgrading DexVault contract: ${dexVault.address}`);
    const { traceTree } = await locklift.tracing.trace(
      dexVault.methods
        .upgrade({
          code: NewDexVaultCode.code,
        })
        .send({
          from: owner.address,
          amount: toNano(6),
        }),
    );
    expect(traceTree).to.emit("VaultCodeUpgraded", dexVault);

    newDexVault = locklift.factory.getDeployedContract(
      "TestNewDexVault",
      dexVault.address,
    );
    newVaultData = await loadVaultData(newDexVault);
    console.log(
      `New Vault(${dexVault.address}) data:\n${JSON.stringify(
        newVaultData,
        null,
        4,
      )}`,
    );
  });

  describe("Check DexVault after upgrade", async function () {
    it("Check New Function", async function () {
      expect(
        (await newDexVault.methods.newFunc().call()).value0.toString(),
      ).to.equal("New Vault", "DexVault new function incorrect");
    });

    it("Check All data correct installed in new contract", async function () {
      expect(newVaultData.platform_code).to.equal(
        oldVaultData.platform_code,
        "New platform_code value incorrect",
      );
      expect(newVaultData.root).to.equal(
        oldVaultData.root,
        "New root value incorrect",
      );
      expect(newVaultData.owner).to.equal(
        oldVaultData.owner,
        "New owner value incorrect",
      );
      expect(newVaultData.pending_owner).to.equal(
        oldVaultData.pending_owner,
        "New pending_owner value incorrect",
      );

      expect(newVaultData.projectId).to.equal(
        oldVaultData.projectId,
        "New projectId value incorrect",
      );
      expect(newVaultData.projectAddress).to.equal(
        oldVaultData.projectAddress,
        "New projectAddress value incorrect",
      );
    });
  });
});
