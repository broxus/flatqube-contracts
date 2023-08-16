import { Constants } from "utils/consts";
import { expect } from "chai";

import { Address, Contract, toNano } from "locklift";
import {
  DexAccountAbi,
  DexRootAbi,
  TestNewDexAccountAbi,
} from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";

interface IAccountData {
  root: Address;
  vault: Address;
  current_version: string;
  platform_code: string;
  wallets: [Address, Address][];
  balances: [Address, string][];
  owner: Address;
}

let NewDexAccount: Contract<TestNewDexAccountAbi>;
let NewDexAccountArt: ContractData<TestNewDexAccountAbi>;
let rootOwner: Account;
let account2: Account;
let dexAccount: Contract<DexAccountAbi>;
let dexRoot: Contract<DexRootAbi>;

let oldAccountData: IAccountData = {} as IAccountData;
let newAccountData: IAccountData = {} as IAccountData;

const loadAccountData = async (
  account: Contract<TestNewDexAccountAbi> | Contract<DexAccountAbi>,
) => {
  const data: any = {};

  data.root = (await account.methods.getRoot({ answerId: 0 }).call()).value0;
  data.vault = (
    await account.methods
      .getVault({
        answerId: 0,
      })
      .call()
  ).value0;
  data.current_version = (
    await account.methods.getVersion({ answerId: 0 }).call()
  ).value0.toString();
  data.platform_code = (
    await account.methods.platform_code().call()
  ).platform_code;
  data.owner = (await account.methods.getOwner({ answerId: 0 }).call()).value0;
  data.wallets = (await account.methods.getWallets().call()).value0;
  data.balances = (await account.methods.getBalances().call()).value0;

  return data;
};

describe("Test Dex Account contract upgrade", async function () {
  this.timeout(Constants.TESTS_TIMEOUT);
  before("Load contracts", async function () {
    rootOwner = locklift.deployments.getAccount("Account1").account;
    account2 = locklift.deployments.getAccount("Account2").account;
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    dexAccount = locklift.deployments.getContract<DexAccountAbi>("DexAccount2");
    NewDexAccount =
      locklift.deployments.getContract<TestNewDexAccountAbi>(
        "TestNewDexAccount",
      );
    NewDexAccountArt =
      locklift.factory.getContractArtifacts("TestNewDexAccount");
    oldAccountData = await loadAccountData(dexAccount);

    console.log(
      `Old Account(${dexAccount.address}) data:\n${JSON.stringify(
        oldAccountData,
        null,
        4,
      )}`,
    );

    console.log(
      `Requesting upgrade for DexAccount contract: ${dexAccount.address}`,
    );
    console.log(
      `Installing new DexAccount contract in DexRoot: ${dexRoot.address}`,
    );
    await dexRoot.methods
      .installOrUpdateAccountCode({ code: NewDexAccountArt.code })
      .send({
        from: rootOwner.address,
        amount: toNano(1),
      });
    await dexAccount.methods
      .requestUpgrade({ send_gas_to: account2.address })
      .send({
        from: rootOwner.address,
        amount: toNano(6),
      });

    // NewDexAccountArt.setAddress(dexAccount.address);
    newAccountData = await loadAccountData(NewDexAccount);
    console.log(
      `New Account(${NewDexAccount.address}) data:\n${JSON.stringify(
        newAccountData,
        null,
        4,
      )}`,
    );
  });
  describe("Check DexAccount after upgrade", async function () {
    it("Check New Function", async function () {
      expect(
        (await NewDexAccount.methods.newFunc().call()).toString(),
      ).to.equal("New Account", "DexAccount new function incorrect");
    });
    it("Check All data correct installed in new contract", async function () {
      expect(newAccountData).to.equal(
        oldAccountData.root,
        "New root value incorrect",
      );
      expect(newAccountData.vault).to.equal(
        oldAccountData.vault,
        "New vault value incorrect",
      );
      expect(newAccountData.vault).to.equal(
        oldAccountData.vault,
        "New vault value incorrect",
      );
      expect(newAccountData.platform_code).to.equal(
        oldAccountData.platform_code,
        "New platform_code value incorrect",
      );
      expect(newAccountData.current_version).to.equal(
        (parseInt(oldAccountData.current_version) + 1).toString(),
        "New current_version value incorrect",
      );
      expect(newAccountData.balances).to.deep.equal(
        oldAccountData.balances,
        "New balances value incorrect",
      );
      expect(newAccountData.wallets).to.deep.equal(
        oldAccountData.wallets,
        "New wallets value incorrect",
      );
    });
  });
});
