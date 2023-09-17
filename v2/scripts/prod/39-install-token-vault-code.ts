import { Command } from "commander";

import { installTokenVaultCode } from "../../../utils/upgrade.utils";
import { displayTx } from "../../../utils/helpers";

async function main() {
  const program = new Command();

  program
    .allowUnknownOption()
    .option(
      "-cn, --contract_name <contract_name>",
      "New version of contract name",
    );

  program.parse(process.argv);

  const options = program.opts();

  options.contract_name = options.contract_name || "DexTokenVault";

  const NextVersionContract = await locklift.factory.getContractArtifacts(
    options.contract_name,
  );

  console.log(`Update token vault code`);
  const tx = await installTokenVaultCode(NextVersionContract);
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
