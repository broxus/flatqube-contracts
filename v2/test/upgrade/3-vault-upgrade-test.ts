import { Constants } from "utils/consts";
import { expect } from "chai";

import { Address, Contract, toNano } from "locklift";
import {
  DexPlatformAbi,
  DexRootAbi,
  DexVaultAbi,
  TokenFactoryAbi,
  TestNewDexVaultAbi,
} from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";

interface IVaultData {
  root: Address;
  vault: Address;
  owner: Address;
  pending_owner: Address;
  current_version: string;
  platform_code: string;
  lp_token_pending_code: string;
  projectId: string;
  projectAddress: Address;
}

let DexRootCode: ContractData<DexRootAbi>;
let DexVaultCode: ContractData<DexVaultAbi>;
let DexPlatformCode: ContractData<DexPlatformAbi>;
let TokenFactoryCode: ContractData<TokenFactoryAbi>;
let NewDexVaultCode: ContractData<TestNewDexVaultAbi>;
// let DexVaultLpTokenPendingCode: ContractData<DexVa>;

let account: Account;
let dexRoot: Contract<DexRootAbi>;
let dexVault: Contract<DexVaultAbi>;
let newDexVault: Contract<TestNewDexVaultAbi>;
let tokenFactory: Contract<TokenFactoryAbi>;

let oldVaultData: IVaultData = {} as IVaultData;
let newVaultData: IVaultData = {} as IVaultData;

const loadVaultData = async (
  vault: Contract<DexVaultAbi> | Contract<TestNewDexVaultAbi>,
) => {
  const data: IVaultData = {} as IVaultData;
  data.platform_code = (
    await vault.methods.platform_code().call()
  ).platform_code;

  // data.lp_token_pending_code = await vault.methods
  //   .getLpTokenPendingCode()
  //   .call();

  data.root = (await vault.methods.getRoot({ answerId: 0 }).call()).value0;
  data.owner = (await vault.methods.getOwner({ answerId: 0 }).call()).value0;
  data.pending_owner = (
    await vault.methods.getPendingOwner({ answerId: 0 }).call()
  ).value0;
  // data.token_factory = (
  //   await vault.methods.getTokenFactory({ answerId: 0 }).call()
  // ).value0;
  // data.lpVaultWallets = (
  //   await vault.methods._lpVaultWallets({ answerId: 0 }).call()
  // ).value0;

  const referralProgramParams = (
    await vault.methods.getReferralProgramParams({ answerId: 0 }).call()
  ).value0;
  data.projectId = referralProgramParams.projectId.toString();
  data.projectAddress = referralProgramParams.projectAddress;

  return data;
};

describe("Test Dex Vault contract upgrade", async function () {
  this.timeout(Constants.TESTS_TIMEOUT);
  before("Load contracts", async function () {
    account = locklift.deployments.getAccount("Account1").account;
    DexRootCode = await locklift.factory.getContractArtifacts("DexRoot");
    DexVaultCode = await locklift.factory.getContractArtifacts("DexVault");
    DexPlatformCode = await locklift.factory.getContractArtifacts(
      "DexPlatform",
    );
    TokenFactoryCode = await locklift.factory.getContractArtifacts(
      "TokenFactory",
    );
    NewDexVaultCode = await locklift.factory.getContractArtifacts(
      "TestNewDexVault",
    );

    // DexVaultLpTokenPending = await locklift.factory.getContract(
    //   "DexVaultLpTokenPending",
    // );
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
    tokenFactory =
      locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");
    oldVaultData = await loadVaultData(dexVault);

    console.log(`Upgrading DexVault contract: ${dexVault.address}`);
    await dexVault.methods
      .upgrade({
        code: NewDexVaultCode.code,
      })
      .send({
        from: account.address,
        amount: toNano(6),
      });

    newDexVault = locklift.factory.getDeployedContract(
      "TestNewDexVault",
      dexVault.address,
    );
    newVaultData = await loadVaultData(newDexVault);
  });
  describe("Check DexVault after upgrade", async function () {
    console.log(DexRootCode.code, "DexRootCode");
    console.log(DexVaultCode.code, "DexVaultCode");
    console.log(DexPlatformCode.code, "DexPlatformCode");
    console.log(TokenFactoryCode.code, "TokenFactoryCode");
    console.log(dexRoot.address, "dexRoot");
    console.log(tokenFactory.address, "tokenFactory");
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
      expect(newVaultData.lp_token_pending_code).to.equal(
        oldVaultData.lp_token_pending_code,
        "New lp_token_pending_code value incorrect",
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
      // expect(newVaultData.token_factory).to.equal(
      //   oldVaultData.token_factory,
      //   "New token_factory value incorrect",
      // );
      //
      // expect(JSON.stringify(newVaultData.lpVaultWallets)).to.equal(
      //   JSON.stringify(oldVaultData.lpVaultWallets),
      //   "New lpVaultWallets value incorrect",
      // );

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
