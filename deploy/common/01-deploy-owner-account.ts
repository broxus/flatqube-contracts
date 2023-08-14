import { WalletTypes, toNano } from "locklift";
import { EVER_WALLET_AMOUNT } from "../../utils/consts";

//npx locklift deploy --network local --disable-build --force
export default async () => {
  await locklift.deployments.deployAccounts(
    [
      {
        deploymentName: "DexOwner",
        signerId: "0",
        accountSettings: {
          type: WalletTypes.EverWallet,
          value: toNano(EVER_WALLET_AMOUNT),
        },
      },
    ],
    true,
  );
};

export const tag = "owner-account";
