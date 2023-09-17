import { Command } from "commander";

import { installPoolCode } from "../../../utils/upgrade.utils";
import { displayTx } from "../../../utils/helpers";

async function main() {
  const program = new Command();

  program
    .allowUnknownOption()
    .option(
      "-cn, --contract_name <contract_name>",
      "New version of contract name",
    )
    .option("-pt, --pool_type <pool_type>", "Pool type");

  program.parse(process.argv);

  const options = program.opts();

  options.contract_name = options.contract_name || "DexStablePool";
  options.pool_type = options.pool_type || 3;

  const NextVersionContract = await locklift.factory.getContractArtifacts(
    options.contract_name,
  );

  console.log(`Update pool code (pool type = ${options.pool_type})`);
  const tx = await installPoolCode(NextVersionContract, options.pool_type);
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
