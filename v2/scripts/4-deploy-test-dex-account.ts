import { Command } from "commander";
import { deployDexAccount } from "../../utils/deploy.utils";

const program = new Command();

program
  .allowUnknownOption()
  .option("-cn, --contract_name <contract_name>", "DexAccount contract name");

program.parse(process.argv);

const options = program.opts();

options.contract_name = options.contract_name || "DexAccount";

async function main() {
  await locklift.deployments.load();

  const account = locklift.deployments.getAccount("DexOwner").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  const dexAccountAddress = await deployDexAccount(account.address);
  console.log(`DexAccount: ${dexAccountAddress}`);

  await locklift.deployments.saveContract({
    contractName: options.contract_name,
    deploymentName: "OwnerDexAccount",
    address: dexAccountAddress,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
