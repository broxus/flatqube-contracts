import { Address, toNano } from "locklift";
import { DexRootAbi } from "../../../build/factorySource";
import { ACCOUNTS_N } from "../../../utils/consts";

interface IDexAcc {
  address: Address;
  index: number;
}

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const commonWallets: Promise<IDexAcc>[] = [];

  // parallel deploying
  for (let j = 0; j < ACCOUNTS_N; j++) {
    const acc = locklift.deployments.getAccount(`commonAccount-${j}`).account;

    const wallet: Promise<IDexAcc> = new Promise(async resolve => {
      await locklift.transactions
        .waitFinalized(
          dexRoot.methods
            .deployAccount({
              account_owner: acc.address,
              send_gas_to: acc.address,
            })
            .send({
              from: acc.address,
              amount: toNano(4),
            }),
        )
        .then(() => {
          return dexRoot.methods
            .getExpectedAccountAddress({
              answerId: 0,
              account_owner: acc.address,
            })
            .call();
        })
        .then(val => {
          resolve({
            address: val.value0,
            index: j,
          });
        });
    });
    commonWallets.push(wallet);
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

  const dexAccountAddress = (
    await dexRoot.methods
      .getExpectedAccountAddress({
        answerId: 0,
        account_owner: owner.address,
      })
      .call()
  ).value0;

  await locklift.deployments.saveContract({
    contractName: "DexAccount",
    deploymentName: `OwnerDexAccount`,
    address: dexAccountAddress,
  });

  console.log(`OwnerDexAccount deployed: ${dexAccountAddress}`);

  const resolvePromisesSeq = async (walletsData: Promise<IDexAcc>[]) => {
    for (const data of walletsData) {
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

  await resolvePromisesSeq(commonWallets);
};

export const tag = "dex-accounts";

export const dependencies = [
  "owner-account",
  "token-factory",
  "common-accounts",
];
