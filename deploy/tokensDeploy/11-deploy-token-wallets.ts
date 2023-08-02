import { toNano } from "locklift";
import { ACCOUNTS_N } from "../common/commonAccounts";
import { TOKENS_N, TOKENS_DECIMALS } from "./10-deploy-tokens";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;

  for (let i = 0; i < TOKENS_DECIMALS.length; i++) {
    for (let k = 0; k < TOKENS_N; k++) {
      const token = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${i}-${k}`,
      );

      const ownerWalletAddress = (
        await token.methods
          .walletOf({
            answerId: 0,
            walletOwner: owner.address,
          })
          .call()
      ).value0;

      const ownerWallet = await locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        ownerWalletAddress,
      );

      await locklift.deployments.saveContract({
        contractName: "TokenWalletUpgradeable",
        deploymentName: `ownerWallet-${i}-${k}`,
        address: ownerWallet.address,
      });

      console.log(`ownerWallet-${i} deployed`);
      const arrOfWallets = [];

      for (let j = 0; j < ACCOUNTS_N; j++) {
        const account = locklift.deployments.getAccount(
          "commonAccount-" + j,
        ).account;

        const wallet: Promise<string> = new Promise(async resolve => {
          ownerWallet.methods
            .transfer({
              amount: 10 ** 14,
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
                deploymentName: `wallet-${i}-${k}-${j}`,
                address: walletAddress,
              });

              resolve(`wallet-${i}-${k}-${j}: ${walletAddress}`);
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

      console.log(`creating wallets for ${i} account...`);
      await resolvePromisesSeq(arrOfWallets);
    }
  }
};

export const tag = "token-wallets";
export const dependencies = ["owner-account", "tokens", "common-accounts"];
