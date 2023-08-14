import { toNano, getRandomNonce } from "locklift";

async function main() {
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

  console.log(`DexGasValues: ${gasValues.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
