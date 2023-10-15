import { toNano } from "locklift";
import { Command } from "commander";

import { DexRootAbi, DexVaultAbi } from "../build/factorySource";

const program = new Command();

program
  .allowUnknownOption()
  .option(
    "-rcn, --root_contract_name <root_contract_name>",
    "DexRoot contract name",
  )
  .option(
    "-pcn, --pair_contract_name <pair_contract_name>",
    "DexPair contract name",
  )
  .option(
    "-acn, --account_contract_name <account_contract_name>",
    "DexAccount contract name",
  )
  .option("-o, --new_owner <new_owner>", "DexAccount contract name");

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || "DexRoot";
options.vault_contract_name = options.vault_contract_name || "DexVault";
options.pair_contract_name = options.pair_contract_name || "DexPair";
options.account_contract_name = options.account_contract_name || "DexAccount";

async function main() {
  if (options.new_owner) {
    await locklift.deployments.load();

    const account = locklift.deployments.getAccount("DexOwner").account;
    const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

    console.log(`Account address: ${account.address}`);
    console.log(`DexRoot address: ${dexRoot.address}`);
    console.log(`DexVault address: ${dexVault.address}`);

    console.log(
      `Transferring DEX ownership from ${account.address} to ${options.new_owner}`,
    );

    console.log(`Transfer ownership for DexRoot`);
    await dexRoot.methods
      .transferOwner({
        new_owner: options.new_owner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });

    console.log(`Transfer ownership for DexVault`);
    await dexVault.methods
      .transferOwner({
        new_owner: options.new_owner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
  } else {
    console.log("REQUIRED: --new_owner <new_owner>");
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
