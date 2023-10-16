import { Command } from "commander";

import { DexAccountAbi } from "../build/factorySource";
import { displayTx } from "../utils/helpers";
import { upgradeAccount } from "../utils/upgrade.utils";

const program = new Command();

program
  .allowUnknownOption()
  .option(
    "-ocn, --old_contract_name <old_contract_name>",
    "Old DexAccount's contract name",
  )
  .option(
    "-ncn, --new_contract_name <new_contract_name>",
    "New DexAccount's contract name",
  );

program.parse(process.argv);

const options = program.opts();

options.old_contract_name = options.old_contract_name || "DexAccountPrev";
options.new_contract_name = options.new_contract_name || "DexAccount";

async function main() {
  await locklift.deployments.load();

  const owner = locklift.deployments.getAccount(`DexOwner`).account;
  const dexAccount =
    locklift.deployments.getContract<DexAccountAbi>(`OwnerDexAccount`);
  const oldVersion = await dexAccount.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.value0);

  const tx = await upgradeAccount(
    owner,
    dexAccount,
    locklift.factory.getContractArtifacts(options.new_contract_name),
  );
  displayTx(tx);

  const newVersion = await dexAccount.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.value0);

  console.log(`Upgraded dexAccount contract ${dexAccount.address}:\n
      - old version: ${oldVersion}
      - new version: ${newVersion}`);

  await locklift.deployments.saveContract({
    contractName: options.new_contract_name,
    deploymentName: `OwnerDexAccount`,
    address: dexAccount.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
