import { toNano } from "locklift";
import { displayTx } from "../utils/helpers";
import { Command } from "commander";
import { DexRootAbi } from "../build/factorySource";

const program = new Command();

program
  .allowUnknownOption()
  .option(
    "-rcn, --root_contract_name <root_contract_name>",
    "DexRoot contract name",
  );

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || "DexRoot";

let tx;

async function main() {
  await locklift.deployments.load();
  const account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  console.log(`Account address: ${account.address}`);
  console.log(`DexRoot address: ${dexRoot.address}`);

  console.log(`Accepting DEX ownership from by ${account.address}`);
  tx = await dexRoot.methods.acceptOwner().send({
    from: account.address,
    amount: toNano(1),
  });
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
