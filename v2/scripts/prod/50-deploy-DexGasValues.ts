import { displayTx } from "../../../utils/helpers";
import { toNano, getRandomNonce, Address } from "locklift";
import { Command } from "commander";

async function main() {
  const program = new Command();

  program.allowUnknownOption().option("-o, --owner <owner>", "owner");
  program.parse(process.argv);
  const options = program.opts();

  const newOwner = new Address(options.owner);

  const signer = await locklift.keystore.getSigner("0");
  const account = locklift.deployments.getAccount("Account1").account;

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
        contract: "DexGasValues",
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

  await locklift.deployments.saveContract({
    contractName: "DexGasValues",
    deploymentName: "DexGasValues",
    address: gasValues.address,
  });

  console.log(`DexGasValues: ${gasValues.address}`);

  console.log(`Transfer ownership for DexGasValues: ${gasValues.address}`);
  const tx = await gasValues.methods
    .transferOwner({
      new_owner: newOwner,
    })
    .send({
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
