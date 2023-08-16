import { getRandomNonce, toNano } from "locklift";

export default async () => {
  const signer = await locklift.keystore.getSigner("0");
  const owner = locklift.deployments.getAccount("DexOwner").account;

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexGasValues",
        constructorParams: {
          owner_: owner.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexGasValues",
      enableLogs: true,
    }),
  );
};

export const tag = "dex-gas-values";

export const dependencies = ["owner-account"];
