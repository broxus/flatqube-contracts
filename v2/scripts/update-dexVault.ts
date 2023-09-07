import { Command } from "commander";
import { DexVaultAbi } from "build/factorySource";
import { upgradeVault } from "../../utils/upgrade.utils";
import { displayTx } from "../../utils/helpers";
const program = new Command();

program
  .allowUnknownOption()
  .option("-old, --old_contract <old_contract>", "Old contract name")
  .option("-new, --new_contract <new_contract>", "New contract name");

program.parse(process.argv);
const options = program.opts();
options.old_contract = options.old_contract || "DexVaultPrev";
options.new_contract = options.new_contract || "DexVault";

async function main() {
  await locklift.deployments.load();

  const dexVaultPrev =
    locklift.deployments.getContract<DexVaultAbi>("DexVault");

  const DexVault = await locklift.factory.getContractArtifacts(
    options.new_contract,
  );

  console.log(`Upgrading DexVault contract: ${dexVaultPrev.address}`);

  const tx = await upgradeVault(dexVaultPrev, DexVault);
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
