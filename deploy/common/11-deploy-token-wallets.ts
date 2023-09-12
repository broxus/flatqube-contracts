import { toNano } from "locklift";
import { ACCOUNTS_N } from "../../utils/consts";
import { TOKENS_N, TOKENS_DECIMALS } from "../../utils/consts";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";
import { getWallet } from "../../utils/wrappers";
import BigNumber from "bignumber.js";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;

  // creating tokens wallets like: token-6-1-2
  // where 6 - decimal, 1 - token num, 2 - account num
  for (let i = 0; i < TOKENS_DECIMALS.length; i++) {
    for (let k = 0; k < TOKENS_N; k++) {
      const token = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${TOKENS_DECIMALS[i]}-${k}`,
      );
      const decimals = await token.methods
        .decimals({ answerId: 0 })
        .call()
        .then(a => Number(a.value0));

      const ownerWallet = await getWallet(owner.address, token.address).then(
        a => a.walletContract,
      );

      // await locklift.deployments.saveContract({
      //   contractName: "TokenWalletUpgradeable",
      //   deploymentName: `ownerWallet-${TOKENS_DECIMALS[i]}-${k}`,
      //   address: ownerWallet.address,
      // });

      console.log(
        `ownerWallet-${i}-${k} deployed: ${ownerWallet.address.toString()}`,
      );
      const arrOfWallets = [];

      for (let j = 0; j < ACCOUNTS_N; j++) {
        const account = locklift.deployments.getAccount(
          "commonAccount-" + j,
        ).account;

        const wallet: Promise<string> = new Promise(async resolve => {
          ownerWallet.methods
            .transfer({
              amount: new BigNumber(10000).shiftedBy(decimals).toString(),
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
              //   deploymentName: `wallet-${TOKENS_DECIMALS[i]}-${k}-${j}`,
              //   address: walletAddress,
              // });

              resolve(
                `wallet-${
                  TOKENS_DECIMALS[i]
                }-${k}-${j}: ${walletAddress.toString()}`,
              );
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
    }
  }
};

export const tag = "token-wallets";
export const dependencies = ["owner-account", "tokens", "common-accounts"];
