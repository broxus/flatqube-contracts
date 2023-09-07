import { expect } from "chai";

import { Address, Contract, toNano } from "locklift";
import { DexAccountAbi, TestNewDexAccountAbi } from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";
import {
  forceUpgradeAccount,
  upgradeAccount,
} from "../../../utils/upgrade.utils";

interface IAccountData {
  root: string;
  vault: string;
  current_version: string;
  platform_code: string;
  wallets: (readonly [Address, Address])[];
  balances: (readonly [Address, string])[];
  owner: string;
}

async function loadAccountData(
  account: Contract<TestNewDexAccountAbi> | Contract<DexAccountAbi>,
) {
  const data = {} as IAccountData;

  data.root = await account.methods
    .getRoot({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());
  data.vault = await account.methods
    .getVault({
      answerId: 0,
    })
    .call()
    .then(a => a.value0.toString());
  data.current_version = await account.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());
  data.platform_code = await account.methods
    .platform_code()
    .call()
    .then(a => a.platform_code);
  data.owner = await account.methods
    .getOwner({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());
  data.wallets = (await account.methods.getWallets().call()).value0;
  data.balances = (await account.methods.getBalances().call()).value0;

  return data;
}

function checkAccountData(
  oldAccountData: IAccountData,
  newAccountData: IAccountData,
) {
  expect(newAccountData.root).to.equal(
    oldAccountData.root,
    "New root value incorrect",
  );
  expect(newAccountData.vault).to.equal(
    oldAccountData.vault,
    "New vault value incorrect",
  );
  expect(newAccountData.owner).to.equal(
    oldAccountData.owner,
    "New owner value incorrect",
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
}

describe("Test Dex Account contract upgrade", async function () {
  let NewDexAccountArt: ContractData<TestNewDexAccountAbi>;

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-accounts"],
    });

    NewDexAccountArt =
      locklift.factory.getContractArtifacts("TestNewDexAccount");
  });
  describe("Check DexAccount upgrade", async function () {
    let oldAccountData: IAccountData = {} as IAccountData;
    let newAccountData: IAccountData = {} as IAccountData;

    let account: Account;
    let dexAccount: Contract<DexAccountAbi>;
    let NewDexAccount: Contract<TestNewDexAccountAbi>;

    before("DexAccount upgrade", async function () {
      account = locklift.deployments.getAccount("commonAccount-0").account;
      dexAccount =
        locklift.deployments.getContract<DexAccountAbi>("commonDexAccount-0");
      oldAccountData = await loadAccountData(dexAccount);

      await upgradeAccount(account, dexAccount, NewDexAccountArt);

      NewDexAccount = locklift.factory.getDeployedContract(
        "TestNewDexAccount",
        dexAccount.address,
      );

      newAccountData = await loadAccountData(NewDexAccount);
    });

    it("Check New Function", async function () {
      expect(
        await NewDexAccount.methods
          .newFunc()
          .call()
          .then(a => a.value0),
      ).to.equal("New Account", "DexAccount new function incorrect");
    });

    it("Check All data correct installed in new contract", async function () {
      checkAccountData(oldAccountData, newAccountData);
    });
  });

  describe("Check force DexAccount upgrade", async function () {
    let oldAccountData: IAccountData = {} as IAccountData;
    let newAccountData: IAccountData = {} as IAccountData;

    let account: Account;
    let dexAccount: Contract<DexAccountAbi>;
    let NewDexAccount: Contract<TestNewDexAccountAbi>;

    before("Force DexAccount upgrade", async function () {
      account = locklift.deployments.getAccount("commonAccount-1").account;
      dexAccount =
        locklift.deployments.getContract<DexAccountAbi>("commonDexAccount-1");
      oldAccountData = await loadAccountData(dexAccount);

      await forceUpgradeAccount(account.address, NewDexAccountArt, false);

      NewDexAccount = locklift.factory.getDeployedContract(
        "TestNewDexAccount",
        dexAccount.address,
      );

      newAccountData = await loadAccountData(NewDexAccount);
    });

    it("Check New Function", async function () {
      expect(
        await NewDexAccount.methods
          .newFunc()
          .call()
          .then(a => a.value0),
      ).to.equal("New Account", "DexAccount new function incorrect");
    });

    it("Check All data correct installed in new contract", async function () {
      checkAccountData(oldAccountData, newAccountData);
    });
  });
});
