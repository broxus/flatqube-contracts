import { getRandomNonce, toNano } from "locklift";
import { Command } from "commander";
import prompts from "prompts";
import { isValidEverAddress } from "utils/helpers";

async function main() {
  const program = new Command();

  const promptsData: any[] = [];

  program
    .allowUnknownOption()
    .option("-evroot", "--weverroot <weverRoot>", "WEver Root")
    .option("-ewvault", "--wevervault <weverVault>", "WEver Vault");

  program.parse(process.argv);

  const options = program.opts();

  if (!isValidEverAddress(options.weverroot)) {
    promptsData.push({
      type: "text",
      name: "weverRoot",
      message: "WEver Root",
      validate: (value: any) =>
        isValidEverAddress(value) ? true : "Invalid Ever address",
    });
  }

  if (!isValidEverAddress(options.wevervault)) {
    promptsData.push({
      type: "text",
      name: "weverVault",
      message: "WEver Vault",
      validate: (value: any) =>
        isValidEverAddress(value) ? true : "Invalid Ever address",
    });
  }

  const response = await prompts(promptsData);
  const weverRoot_ = options.weverroot || response.weverRoot;
  const weverVault_ = options.wevervault || response.weverVault;

  const signer = await locklift.keystore.getSigner("0");

  const {
    extTransaction: { contract: tip3ToEver },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "Tip3ToEver",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot_,
          weverVault: weverVault_,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "Tip3ToEver",
    }),
  );

  console.log(`'TIP3 to Ever': ${tip3ToEver.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
