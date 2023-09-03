import { Contract, toNano } from "locklift";
import { TestNewDexPairAbi } from "../../build/factorySource";
import {
  Migration,
  Constants,
  displayTx,
} from "../../utils/oldUtils/migration";

const { expect } = require("chai");
const logger = require("mocha-logger");
const BigNumber = require("bignumber.js");
BigNumber.config({ EXPONENTIAL_AT: 257 });
import { Command } from "commander";

const program = new Command();

const migration = new Migration();

program
  .allowUnknownOption()
  .option("-l, --left <left>", "left root")
  .option("-r, --right <right>", "right root")
  .option(
    "-ocn, --old_contract_name <old_contract_name>",
    "Old DexPair contract name",
  )
  .option(
    "-ncn, --new_contract_name <new_contract_name>",
    "New DexPair contract name",
  )
  .option("-pt, --pool_type <pool_type>", "Pool type");

program.parse(process.argv);

const options = program.opts();

options.left = options.left || "foo";
options.right = options.right || "bar";
options.old_contract_name = options.old_contract_name || "DexPairPrev";
options.new_contract_name = options.new_contract_name || "DexPair";
options.pool_type = options.pool_type || "1";

const tokenLeft = Constants.tokens[options.left];
const tokenRight = Constants.tokens[options.right];

let NewVersionContract: Contract<TestNewDexPairAbi>;

let account;
let tokenFoo;
let tokenBar;
let dexRoot;
let dexPairFooBar;

let targetVersion: string;

type PairData = {
  threshold?: any;
  referrer_threshold?: any;
  fee_referrer?: any;
  fee_beneficiary_address?: any;
  fee_beneficiary?: any;
  fee_pool?: any;
  right_balance?: any;
  left_balance?: any;
  lp_supply?: any;
  vault_right_wallet?: any;
  vault_left_wallet?: any;
  right_wallet?: any;
  left_wallet?: any;
  lp_wallet?: any;
  active?: any;
  right_root?: any;
  left_root?: any;
  lp_root?: any;
  platform_code?: any;
  vault?: any;
  root?: any;
  pool_type?: any;
  current_version?: any;
};

let oldPairData: PairData = {};
let newPairData: PairData = {};

async function loadPairData(
  pair: Contract<TestNewDexPairAbi>,
  contractName: string,
): Promise<PairData> {
  const data: PairData = {};

  data.root = (
    await pair.methods.getRoot({ answerId: 0 }).call()
  ).dex_root.toString();
  // data.vault = (await pair.methods.getVault({answerId: 0}).call()).dex_vault.toString();

  data.current_version = (
    await pair.methods.getVersion({ answerId: 0 }).call()
  ).version;
  data.platform_code = (
    await pair.methods.platform_code().call()
  ).platform_code;

  const token_roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
  data.lp_root = token_roots.lp.toString();
  data.left_root = token_roots.left.toString();
  data.right_root = token_roots.right.toString();

  data.active = (await pair.methods.isActive({ answerId: 0 }).call()).value0;

  const token_wallets = await pair.methods
    .getTokenWallets({ answerId: 0 })
    .call();
  data.lp_wallet = token_wallets.lp.toString();
  data.left_wallet = token_wallets.left.toString();
  data.right_wallet = token_wallets.right.toString();

  // const vault_token_wallets = await pair.methods.getVaultWallets({answerId: 0}).call();
  // data.vault_left_wallet = vault_token_wallets.left.toString();
  // data.vault_right_wallet = vault_token_wallets.right.toString();

  const balances = (await pair.methods.getBalances({ answerId: 0 }).call())
    .value0;
  data.lp_supply = balances.lp_supply.toString();
  data.left_balance = balances.left_balance.toString();
  data.right_balance = balances.right_balance.toString();

  const fee_params = (await pair.methods.getFeeParams({ answerId: 0 }).call())
    .value0;
  data.fee_pool = new BigNumber(fee_params.pool_numerator)
    .div(fee_params.denominator)
    .times(100)
    .toString();
  data.fee_beneficiary = new BigNumber(fee_params.beneficiary_numerator)
    .div(fee_params.denominator)
    .times(100)
    .toString();
  data.fee_beneficiary_address = fee_params.beneficiary.toString();
  data.threshold = fee_params.threshold;
  if (contractName === "DexPair" || contractName === "DexStablePair") {
    data.fee_referrer = new BigNumber(fee_params.referrer_numerator)
      .div(fee_params.denominator)
      .times(100)
      .toString();
    data.referrer_threshold = fee_params.referrer_threshold;
  }
  data.pool_type = Number(
    (await pair.methods.getPoolType({ answerId: 0 }).call()).value0,
  );

  return data;
}

console.log(``);
console.log(
  `##############################################################################################`,
);
console.log(`35-upgrade-pair.js`);
console.log(`OPTIONS: `, options);

describe("Test Dex Pair contract upgrade", async function () {
  this.timeout(Constants.TESTS_TIMEOUT);

  before("Load contracts", async function () {
    account = await migration.loadAccount("Account1", "0");
    dexRoot = migration.loadContract("DexRoot", "DexRoot");
    dexPairFooBar = migration.loadContract(
      options.old_contract_name,
      "DexPool" + tokenLeft.symbol + tokenRight.symbol,
    );

    targetVersion = (
      await dexRoot.methods
        .getPairVersion({ answerId: 0, pool_type: options.pool_type })
        .call()
    ).value0;

    tokenFoo = migration.loadContract(
      "TokenRootUpgradeable",
      tokenLeft.symbol + "Root",
    );
    tokenBar = migration.loadContract(
      "TokenRootUpgradeable",
      tokenRight.symbol + "Root",
    );

    oldPairData = await loadPairData(dexPairFooBar, options.old_contract_name);
    logger.log(
      `Old Pair(${dexPairFooBar.address}) data:\n${JSON.stringify(
        oldPairData,
        null,
        4,
      )}`,
    );
    logger.log(`Upgrading DexPair contract: 
        - left=${tokenFoo.address}
        - right=${tokenBar.address}
        - current version = ${oldPairData.current_version}
        - current pool_type = ${oldPairData.pool_type}
        - target version = ${targetVersion}
        - target pool_type = ${options.pool_type}`);

    const tx = await locklift.transactions.waitFinalized(
      dexRoot.methods
        .upgradePair({
          left_root: tokenFoo.address,
          right_root: tokenBar.address,
          send_gas_to: account.address,
          pool_type: options.pool_type,
        })
        .send({
          from: account.address,
          amount: toNano(6),
        }),
    );

    console.log(`##########################`);
    displayTx(tx);
    console.log(`##########################`);

    NewVersionContract = await locklift.factory.getDeployedContract(
      options.new_contract_name,
      dexPairFooBar.address,
    );
    newPairData = await loadPairData(
      NewVersionContract,
      options.new_contract_name,
    );
    logger.log(
      `New Pair(${NewVersionContract.address}) data:\n${JSON.stringify(
        newPairData,
        null,
        4,
      )}`,
    );
  });
  describe("Check DexPair after upgrade", async function () {
    if (options.new_contract_name === "TestNewDexPair") {
      it("Check New Function", async function () {
        expect(
          (await NewVersionContract.methods.newFunc().call()).toString(),
        ).to.equal("New Pair", "DexPair new function incorrect");
      });
    }
    it("Check All data correct installed in new contract", async function () {
      expect(newPairData.root).to.equal(
        oldPairData.root,
        "New root value incorrect",
      );
      // expect(newPairData.vault)
      //   .to
      //   .equal(oldPairData.vault, 'New vault value incorrect');
      expect(newPairData.platform_code).to.equal(
        oldPairData.platform_code,
        "New platform_code value incorrect",
      );
      expect(newPairData.current_version.toString()).to.equal(
        targetVersion.toString(),
        "New current_version value incorrect",
      );
      expect(newPairData.pool_type.toString()).to.equal(
        options.pool_type,
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
      expect(newPairData.active).to.equal(
        oldPairData.active,
        "New active value incorrect",
      );
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
      // expect(newPairData.vault_left_wallet)
      //   .to
      //   .equal(oldPairData.vault_left_wallet, 'New vault_left_wallet value incorrect');
      // expect(newPairData.vault_right_wallet)
      //   .to
      //   .equal(oldPairData.vault_right_wallet, 'New vault_right_wallet value incorrect');
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

      expect(newPairData.fee_pool).to.equal(
        oldPairData.fee_pool,
        "New fee_pool value incorrect",
      );

      expect(newPairData.fee_beneficiary).to.equal(
        oldPairData.fee_beneficiary,
        "New fee_beneficiary value incorrect",
      );

      expect(newPairData.fee_beneficiary_address).to.equal(
        oldPairData.fee_beneficiary_address,
        "New fee beneficiary value incorrect",
      );

      if (
        options.new_contract_name === "DexPair" ||
        options.new_contract_name === "DexStablePair"
      ) {
        expect(newPairData.fee_referrer).to.not.equal(
          undefined,
          "New fee referrer value incorrect",
        );
      }
    });
  });
});
