import { Constants, TTokenName } from "../../utils/consts";
import { Command } from "commander";
import { deployToken } from "../../utils/wrappers";

const program = new Command();

async function main() {
  await locklift.deployments.load();

  const account = locklift.deployments.getAccount("DexOwner").account;
  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  // ex: --tokens='["qwa"]'
  program
    .allowUnknownOption()
    .option("-t, --tokens <tokens>", "tokens to deploy");

  program.parse(process.argv);

  const options = program.opts();

  const tokens: TTokenName[] = options.tokens
    ? JSON.parse(options.tokens)
    : ["foo", "bar", "tst"];

  for (const tokenId of tokens) {
    const tokenData = Constants.tokens[tokenId] ?? {
      name: tokenId,
      symbol: tokenId,
      decimals: 6,
      upgradeable: true,
    };

    const tokenRootAddress = await deployToken(
      tokenData.name,
      tokenData.symbol,
      "1000000",
      tokenData.decimals,
    );

    console.log(`Token ${tokenData.name}: ${tokenRootAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
