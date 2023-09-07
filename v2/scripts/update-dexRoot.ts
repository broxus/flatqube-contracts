import { Command } from "commander";

import { DexRootAbi } from "../../build/factorySource";
import { displayTx } from "../../utils/helpers";
import { upgradeRoot } from "../../utils/upgrade.utils";

const program = new Command();

program
  .allowUnknownOption()
  .option("-old, --old_contract <old_contract>", "Old contract name")
  .option("-new, --new_contract <new_contract>", "New contract name");

program.parse(process.argv);

const options = program.opts();
options.old_contract = options.old_contract || "DexRootPrev";
options.new_contract = options.new_contract || "DexRoot";

async function main() {
  await locklift.deployments.load();

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const NewDexRoot = locklift.factory.getContractArtifacts(
    options.new_contract,
  );

  console.log(`Upgrading DexRoot contract: ${dexRoot.address}`);

  const tx = await upgradeRoot(dexRoot, NewDexRoot);
  displayTx(tx);

  // const newDexRoot = await locklift.factory.getDeployedContract<"DexRoot">(
  //   options.new_contract,
  //   dexRoot.address,
  // );

  await locklift.deployments.saveContract({
    contractName: options.new_contract,
    deploymentName: "DexRoot",
    address: dexRoot.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
