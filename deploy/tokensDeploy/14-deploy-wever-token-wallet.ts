import { toNano } from "locklift";
import { ACCOUNTS_N } from "../../utils/consts";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;

  const token =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("weverRoot");

  const ownerWalletAddress = (
    await token.methods
      .walletOf({
        answerId: 0,
        walletOwner: owner.address,
      })
      .call()
  ).value0;

  const ownerWallet = locklift.factory.getDeployedContract(
    "TokenWalletUpgradeable",
    ownerWalletAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "TokenWalletUpgradeable",
    deploymentName: `ownerWallet-weverRoot`,
    address: ownerWallet.address,
  });

  console.log(`ownerWallet-weverRoot deployed`);
  const arrOfWallets = [];

  for (let j = 0; j < ACCOUNTS_N; j++) {
    const account = locklift.deployments.getAccount(
      "commonAccount-" + j,
    ).account;

    const wallet: Promise<string> = new Promise(async resolve => {
      ownerWallet.methods
        .transfer({
          amount: 50,
          recipient: account.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: owner.address,
          notify: false,
          payload: "",
        })
        .send({
          from: owner.address,
          amount: toNano(0.5),
        })
        .then(async () => {
          const walletAddress = (
            await token.methods
              .walletOf({
                answerId: 0,
                walletOwner: account.address,
              })
              .call()
          ).value0;

          await locklift.deployments.saveContract({
            contractName: "TokenWalletUpgradeable",
            deploymentName: `wallet-weverRoot-${j}`,
            address: walletAddress,
          });

          resolve(`wallet-weverRoot-${j}: ${walletAddress}`);
        });
    });

    arrOfWallets.push(wallet);
  }

  const resolvePromisesSeq = async (walletsData: Promise<string>[]) => {
    for (const data of walletsData) {
      const result = await data;

      if (result) {
        console.log(`${result} created!`);
      }
    }
  };

  console.log(`creating wallets for wever account...`);
  await resolvePromisesSeq(arrOfWallets);
};

export const tag = "wever-wallets";
export const dependencies = ["owner-account", "tokens", "common-accounts"];
