import { ACCOUNTS_N } from "../../../utils/consts";
import { deployDexAccount } from "../../../utils/deploy.utils";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;

  const { address: dexAccountAddress } = await deployDexAccount(owner.address);

  await locklift.deployments.saveContract({
    contractName: "DexAccount",
    deploymentName: `OwnerDexAccount`,
    address: dexAccountAddress,
  });

  console.log(`OwnerDexAccount deployed: ${dexAccountAddress}`);

  for (let j = 0; j < ACCOUNTS_N; j++) {
    const acc = locklift.deployments.getAccount(`commonAccount-${j}`).account;

    const dexAccount = await deployDexAccount(acc.address).then(
      val => val.address,
    );
    console.log(`commonDexAccount-${j} created: ${dexAccount.toString()}`);

    await locklift.deployments.saveContract({
      contractName: "DexAccount",
      deploymentName: `commonDexAccount-${j}`,
      address: dexAccount,
    });
  }
};

export const tag = "dex-accounts";

export const dependencies = [
  "owner-account",
  "token-factory",
  "common-accounts",
  "dex-root",
];
