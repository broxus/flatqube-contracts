import { Address } from "locklift";

import { displayTx } from "utils/helpers";
import { Command } from "commander";
import { setReferralProgramParams } from "../../../utils/wrappers";
const program = new Command();

program
  .allowUnknownOption()
  .option("-id, --project_id <project_id>", "Project Id")
  .option("-proj, --project_address <project_address>", "Project address")
  .option(
    "-ref_sys, --ref_system_address <ref_system_address>",
    "Referral system address",
  );

program.parse(process.argv);

const options = program.opts();

async function main() {
  await locklift.deployments.load();

  if (
    options.project_id !== undefined &&
    options.project_address !== undefined &&
    options.ref_system_address !== undefined
  ) {
    console.log(
      `Set referral program params:\n -project_id: ${options.project_id}\n -project_address: ${options.project_address}\n -ref_system_address: ${options.ref_system_address}`,
    );
    const tx = await setReferralProgramParams(
      options.project_id,
      new Address(options.project_address),
      new Address(options.ref_system_address),
    );
    displayTx(tx);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
