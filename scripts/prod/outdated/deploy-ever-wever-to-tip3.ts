import { toNano, getRandomNonce } from "locklift";
import { Command } from "commander";
import { isValidEverAddress } from "utils/helpers";
import prompts from "prompts";

const program = new Command();

async function main() {
  const promptsData: any[] = [];

  program
    .allowUnknownOption()
    .option("-evroot", "--weverroot <weverRoot>", "WEVER Root")
    .option("-ewvault", "--wevervault <weverVault>", "WEVER Vault")
    .option(
      "-evertotip3",
      "--evertotip3 <everToTip3>",
      "Swap Ever to Tip3 contract",
    );

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

  if (!isValidEverAddress(options.evertotip3)) {
    promptsData.push({
      type: "text",
      name: "everToTip3",
      message: "Swap Ever contract",
      validate: (value: string) =>
        isValidEverAddress(value) ? true : "Invalid Ever address",
    });
  }

  const response = await prompts(promptsData);
  const weverRoot_ = options.weverroot || response.weverRoot;
  const weverVault_ = options.wevervault || response.weverVault;
  const everToTip3_ = options.evertotip3 || response.everToTip3;

  const signer = await locklift.keystore.getSigner("0");

  const { contract: everWeverToTip3 } = await locklift.factory.deployContract({
    contract: "EverWeverToTip3",
    constructorParams: {},
    initParams: {
      randomNonce_: getRandomNonce(),
      weverRoot: weverRoot_,
      weverVault: weverVault_,
      everToTip3: everToTip3_,
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });

  console.log(`'Ever and Wever to Tip3': ${everWeverToTip3.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
