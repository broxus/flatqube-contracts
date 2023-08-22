import { toNano, getRandomNonce } from "locklift";
import {
  TokenRootUpgradeableAbi,
  TestWeverVaultAbi,
} from "../../build/factorySource";

export default async () => {
  const signer = await locklift.keystore.getSigner("0");
  const weverVault =
    locklift.deployments.getContract<TestWeverVaultAbi>("weverVault");
  const weverRoot =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("weverRoot");

  const { extTransaction: everToTip3 } =
    await locklift.transactions.waitFinalized(
      await locklift.deployments.deploy({
        deployConfig: {
          contract: "EverToTip3",
          constructorParams: {},
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot.address,
            weverVault: weverVault.address,
          },
          publicKey: signer.publicKey,
          value: toNano(2),
        },
        deploymentName: "EverToTip3",
        enableLogs: true,
      }),
    );

  await locklift.transactions.waitFinalized(
    await locklift.deployments.deploy({
      deployConfig: {
        contract: "Tip3ToEver",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot.address,
          weverVault: weverVault.address,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "Tip3ToEver",
      enableLogs: true,
    }),
  );

  await locklift.transactions.waitFinalized(
    await locklift.deployments.deploy({
      deployConfig: {
        contract: "EverWeverToTip3",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot.address,
          weverVault: weverVault.address,
          everToTip3: everToTip3.contract.address,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "EverWeverToTip3",
      enableLogs: true,
    }),
  );
};

export const tag = "ever-wever-tip3";

export const dependencies = ["wever"];
