import { toNano, getRandomNonce } from "locklift";
import { Command } from "commander";
import prompts from "prompts";
import { isValidEverAddress } from "utils/helpers";

const program = new Command();

async function main() {
  const promptsData: any[] = [];

  program
    .allowUnknownOption()
    .option("-evroot", "--weverroot <weverRoot>", "WEVER Root")
    .option("-ewvault", "--wevervault <weverVault>", "WEVER Vault");

  program.parse(process.argv);

  const options = program.opts();

  if (!isValidEverAddress(options.weverroot)) {
    promptsData.push({
      type: "text",
      name: "weverRoot",
      message: "WEVER Root",
      validate: (value: string) =>
        isValidEverAddress(value) ? true : "Invalid Ever address",
    });
  }

  if (!isValidEverAddress(options.wevervault)) {
    promptsData.push({
      type: "text",
      name: "weverVault",
      message: "WEVER Vault",
      validate: (value: string) =>
        isValidEverAddress(value) ? true : "Invalid Ever address",
    });
  }

  const response = await prompts(promptsData);
  const weverRoot_ = options.weverroot || response.weverRoot;
  const weverVault_ = options.wevervault || response.weverVault;

  const signer = await locklift.keystore.getSigner("0");

  const { contract: everTip3 } = await locklift.factory.deployContract({
    contract: "EverToTip3",
    constructorParams: {},
    initParams: {
      randomNonce_: getRandomNonce(),
      weverRoot: weverRoot_,
      weverVault: weverVault_,
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });

  console.log(`'Ever to Tip3': ${everTip3.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
