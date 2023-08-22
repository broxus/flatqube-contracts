import { getRandomNonce, toNano, WalletTypes } from "locklift";
export const WEVER_DEXPAIR_AMOUNT = 200;
import { ACCOUNTS_N, ACCOUNT_WALLET_AMOUNT } from "../../utils/consts";

export default async () => {
  await locklift.deployments.deployAccounts(
    Array.from({ length: ACCOUNTS_N }, (_, i) => ({
      deploymentName: `commonAccount-${i}`,
      accountSettings: {
        type: WalletTypes.EverWallet,
        value: toNano(ACCOUNT_WALLET_AMOUNT),
        nonce: getRandomNonce(),
      },
      signerId: "0",
    })),
    true,
  );
  //
  // console.log("User Accounts deployed!");
  //
  // for (let j = 0; j < ACCOUNTS_N; j++) {
  //   const account = locklift.deployments.getAccount(
  //     `commonAccount-${j}`,
  //   ).account;
  //
  //   await locklift.provider.sendMessage({
  //     sender: account.address,
  //     recipient: account.address,
  //     amount: toNano(1),
  //     bounce: false,
  //   });
  // }
};

export const tag = "common-accounts";
