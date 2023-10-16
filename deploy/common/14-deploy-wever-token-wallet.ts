import { toNano } from "locklift";
import { ACCOUNTS_N } from "../../utils/consts";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";
import { getWallet } from "../../utils/wrappers";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;

  const token =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-wever");

  const ownerWallet = await getWallet(owner.address, token.address).then(
    a => a.walletContract,
  );

  // await locklift.deployments.saveContract({
  //   contractName: "TokenWalletUpgradeable",
  //   deploymentName: `ownerWallet-weverRoot`,
  //   address: ownerWallet.address,
  // });

  console.log(`ownerWallet-wever deployed: ${ownerWallet.address.toString()}`);
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
          const walletAddress = await getWallet(
            account.address,
            token.address,
          ).then(a => a.walletContract.address);

          // await locklift.deployments.saveContract({
          //   contractName: "TokenWalletUpgradeable",
          //   deploymentName: `wallet-weverRoot-${j}`,
          //   address: walletAddress,
          // });

          resolve(`wallet-wever-${j}: ${walletAddress.toString()}`);
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

  await resolvePromisesSeq(arrOfWallets);
};

export const tag = "wever-wallets";
export const dependencies = [
  "owner-account",
  "tokens",
  "common-accounts",
  "wever",
];
