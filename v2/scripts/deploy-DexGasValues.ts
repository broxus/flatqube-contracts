import { toNano, getRandomNonce } from "locklift";

import { Command } from "commander";
const program = new Command();

program
  .allowUnknownOption()
  .option(
    "-rcn, --root_contract_name <gas_contract_name>",
    "DexGasValues contract name",
  );

program.parse(process.argv);

const options = program.opts();
options.gas_contract_name = options.gas_contract_name || "DexGasValuesPrev";

async function main() {
  await locklift.deployments.load();

  const signer = await locklift.keystore.getSigner("0");
  const account = locklift.deployments.getAccount("DexOwner").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  const {
    extTransaction: { contract: gasValues },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: options.gas_contract_name,
        constructorParams: {
          owner_: account.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexGasValues",
    }),
  );

  console.log(`DexGasValues: ${gasValues.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
