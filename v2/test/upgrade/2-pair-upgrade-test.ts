import { Constants } from "utils/consts";
import { expect } from "chai";

import { Address, Contract, toNano } from "locklift";
import {
  DexPairAbi,
  DexRootAbi,
  TestNewDexPairAbi,
  TokenRootUpgradeableAbi,
} from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { ContractData } from "locklift/internal/factory";

interface IPairData {
  root: Address;
  vault: Address;
  lp_root: Address;
  left_root: Address;
  right_root: Address;
  lp_wallet: Address;
  left_wallet: Address;
  right_wallet: Address;
  lp_supply: string;
  left_balance: string;
  right_balance: string;
  active: boolean;
  current_version: string;
  platform_code: string;
  fee_numerator: string;
  fee_denominator: string;
}

let NewDexPair: ContractData<TestNewDexPairAbi>;
let NewDexPairContract: Contract<TestNewDexPairAbi>;

let account: Account;
let tokenFoo: Contract<TokenRootUpgradeableAbi>;
let tokenBar: Contract<TokenRootUpgradeableAbi>;
let dexRoot: Contract<DexRootAbi>;
let dexPairFooBar: Contract<DexPairAbi>;

let oldPairData: IPairData = {} as IPairData;
let newPairData: IPairData = {} as IPairData;

const loadPairData = async (
  pair: Contract<TestNewDexPairAbi> | Contract<DexPairAbi>,
) => {
  const data = {} as IPairData;

  data.root = (await pair.methods.getRoot({ answerId: 0 }).call()).dex_root;
  data.vault = (await pair.methods.getVault({ answerId: 0 }).call()).value0;

  data.current_version = (
    await pair.methods.getVersion({ answerId: 0 }).call()
  ).toString();
  data.platform_code = (
    await pair.methods.platform_code().call()
  ).platform_code;

  const token_roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
  data.lp_root = token_roots.lp;
  data.left_root = token_roots.left;
  data.right_root = token_roots.right;

  data.active = (await pair.methods.isActive({ answerId: 0 }).call()).value0;

  const token_wallets = await pair.methods
    .getTokenWallets({ answerId: 0 })
    .call();
  data.lp_wallet = token_wallets.lp;
  data.left_wallet = token_wallets.left;
  data.right_wallet = token_wallets.right;

  // const vault_token_wallets = await pair.methods
  //   .getVaultWallets({ answerId: 0 })
  //   .call();
  // data.vault_left_wallet = vault_token_wallets.left;
  // data.vault_right_wallet = vault_token_wallets.right;

  const balances = (await pair.methods.getBalances({ answerId: 0 }).call())
    .value0;
  data.lp_supply = balances.lp_supply.toString();
  data.left_balance = balances.left_balance.toString();
  data.right_balance = balances.right_balance.toString();

  const fee_params = (await pair.methods.getFeeParams({ answerId: 0 }).call())
    .value0;
  data.fee_numerator = fee_params.pool_numerator.toString();
  data.fee_denominator = fee_params.denominator.toString();

  return data;
};

describe("Test Dex Pair contract upgrade", async function () {
  this.timeout(Constants.TESTS_TIMEOUT);

  before("Load contracts", async function () {
    account = locklift.deployments.getAccount("Account1").account;
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    dexPairFooBar =
      locklift.deployments.getContract<DexPairAbi>("DexPairFooBar");
    NewDexPair = await locklift.factory.getContractArtifacts("TestNewDexPair");
    tokenFoo =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>("FooRoot");
    tokenBar =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>("BarRoot");
    oldPairData = await loadPairData(dexPairFooBar);

    console.log(
      `Old Pair(${dexPairFooBar.address}) data:\n${JSON.stringify(
        oldPairData,
        null,
        4,
      )}`,
    );
    console.log(
      `Installing new DexPair contract in DexRoot: ${dexRoot.address}`,
    );
    await dexRoot.methods
      .installOrUpdatePairCode({ code: NewDexPair.code, pool_type: 1 })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    console.log(`Upgrading DexPair contract: 
        - left=${tokenFoo.address}
        - right=${tokenBar.address}`);

    await dexRoot.methods
      .upgradePair({
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
        send_gas_to: account.address,
        pool_type: 1,
      })
      .send({
        from: account.address,
        amount: toNano(6),
      });
    NewDexPairContract = locklift.factory.getDeployedContract(
      "TestNewDexPair",
      dexPairFooBar.address,
    );
    newPairData = await loadPairData(NewDexPairContract);
    console.log(
      `New Pair(${NewDexPairContract.address}) data:\n${JSON.stringify(
        newPairData,
        null,
        4,
      )}`,
    );
  });
  describe("Check DexPair after upgrade", async function () {
    it("Check New Function", async function () {
      expect(
        (await NewDexPairContract.methods.newFunc({}).call()).value0.toString(),
      ).to.equal("New Pair", "DexPair new function incorrect");
    });
    it("Check All data correct installed in new contract", async function () {
      expect(newPairData.root).to.equal(
        oldPairData.root,
        "New root value incorrect",
      );
      expect(newPairData.vault).to.equal(
        oldPairData.vault,
        "New vault value incorrect",
      );
      expect(newPairData.platform_code).to.equal(
        oldPairData.platform_code,
        "New platform_code value incorrect",
      );
      expect(newPairData.current_version).to.equal(
        (parseInt(oldPairData.current_version) + 1).toString(),
        "New current_version value incorrect",
      );
      expect(newPairData.lp_root).to.equal(
        oldPairData.lp_root,
        "New lp_root value incorrect",
      );
      expect(newPairData.left_root).to.equal(
        oldPairData.left_root,
        "New left_root value incorrect",
      );
      expect(newPairData.right_root).to.equal(
        oldPairData.right_root,
        "New right_root value incorrect",
      );
      expect(newPairData.active).to.equal(false, "New active value incorrect");
      expect(newPairData.lp_wallet).to.equal(
        oldPairData.lp_wallet,
        "New lp_wallet value incorrect",
      );
      expect(newPairData.left_wallet).to.equal(
        oldPairData.left_wallet,
        "New left_wallet value incorrect",
      );
      expect(newPairData.right_wallet).to.equal(
        oldPairData.right_wallet,
        "New right_wallet value incorrect",
      );
      // expect(newPairData.vault_left_wallet).to.equal(
      //   oldPairData.vault_left_wallet,
      //   "New vault_left_wallet value incorrect",
      // );
      // expect(newPairData.vault_right_wallet).to.equal(
      //   oldPairData.vault_right_wallet,
      //   "New vault_right_wallet value incorrect",
      // );
      expect(newPairData.lp_supply).to.equal(
        oldPairData.lp_supply,
        "New lp_supply value incorrect",
      );
      expect(newPairData.left_balance).to.equal(
        oldPairData.left_balance,
        "New left_balance value incorrect",
      );
      expect(newPairData.right_balance).to.equal(
        oldPairData.right_balance,
        "New right_balance value incorrect",
      );
      expect(newPairData.fee_numerator).to.equal(
        oldPairData.fee_numerator,
        "New fee_numerator value incorrect",
      );
      expect(newPairData.fee_denominator).to.equal(
        oldPairData.fee_denominator,
        "New fee_denominator value incorrect",
      );
    });
  });
});
