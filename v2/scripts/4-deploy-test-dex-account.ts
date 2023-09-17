import { Command } from "commander";
import { deployDexAccount } from "../../utils/deploy.utils";
import { displayTx } from "../../utils/helpers";

const program = new Command();

program
  .allowUnknownOption()
  .option("-o, --is_owner <is_owner>", "is the account an owner")
  .option("-n, --key_number <key_number>", "account's key number")
  .option("-cn, --contract_name <contract_name>", "DexAccount contract name");

program.parse(process.argv);

const options = program.opts();

options.is_owner = options.is_owner !== "false";
options.contract_name = options.contract_name || "DexAccount";

async function main() {
  await locklift.deployments.load();

  if (options.is_owner) {
    const account = locklift.deployments.getAccount("DexOwner").account;

    const { address: dexAccountAddress, tx } = await deployDexAccount(
      account.address,
    );
    displayTx(tx);
    console.log(`DexAccount: ${dexAccountAddress}`);

    await locklift.deployments.saveContract({
      contractName: options.contract_name,
      deploymentName: "OwnerDexAccount",
      address: dexAccountAddress,
    });
  } else if (options.key_number) {
    const account = locklift.deployments.getAccount(
      `commonAccount-${options.key_number}`,
    ).account;

    const { address: dexAccountAddress, tx } = await deployDexAccount(
      account.address,
    );
    displayTx(tx);
    console.log(`DexAccount: ${dexAccountAddress}`);

    await locklift.deployments.saveContract({
      contractName: options.contract_name,
      deploymentName: `commonDexAccount-${options.key_number}`,
      address: dexAccountAddress,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
