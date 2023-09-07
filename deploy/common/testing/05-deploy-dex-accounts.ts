import { Address, toNano } from "locklift";
import { DexRootAbi } from "../../../build/factorySource";
import { ACCOUNTS_N } from "../../../utils/consts";
import { deployDexAccount } from "../../../utils/deploy.utils";

interface IDexAcc {
  address: Address;
  index: number;
}

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const commonDexAccounts: Promise<IDexAcc>[] = [];

  // parallel deploying
  for (let j = 0; j < ACCOUNTS_N; j++) {
    const acc = locklift.deployments.getAccount(`commonAccount-${j}`).account;

    const dexAccount: Promise<IDexAcc> = deployDexAccount(acc.address).then(
      val => {
        return {
          address: val,
          index: j,
        };
      },
    );
    commonDexAccounts.push(dexAccount);
  }

  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployAccount({
        account_owner: owner.address,
        send_gas_to: owner.address,
      })
      .send({
        from: owner.address,
        amount: toNano(4),
      }),
  );

  const dexAccountAddress = await deployDexAccount(owner.address);

  await locklift.deployments.saveContract({
    contractName: "DexAccount",
    deploymentName: `OwnerDexAccount`,
    address: dexAccountAddress,
  });

  console.log(`OwnerDexAccount deployed: ${dexAccountAddress}`);

  const resolvePromisesSeq = async (accountsData: Promise<IDexAcc>[]) => {
    for (const data of accountsData) {
      const result = await data;

      if (result) {
        console.log(
          `commonDexAccount-${result.index} created: ${result.address}`,
        );

        await locklift.deployments.saveContract({
          contractName: "DexAccount",
          deploymentName: `commonDexAccount-${result.index}`,
          address: result.address,
        });
      }
    }
  };

  await resolvePromisesSeq(commonDexAccounts);
};

export const tag = "dex-accounts";

export const dependencies = [
  "owner-account",
  "token-factory",
  "common-accounts",
  "dex-root",
];
