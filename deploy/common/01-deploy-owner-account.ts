import { WalletTypes, toNano } from "locklift";
import { EVER_WALLET_AMOUNT } from "./commonAccounts";

export default async () => {
  await locklift.deployments.deployAccounts(
    [
      {
        deploymentName: "DexOwner",
        signerId: "0",
        accountSettings: {
          type: WalletTypes.HighLoadWalletV2,
          value: toNano(EVER_WALLET_AMOUNT),
        },
      },
    ],
    true,
  );
};

export const tag = "owner-account";
