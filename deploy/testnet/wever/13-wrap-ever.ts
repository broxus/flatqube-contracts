import { toNano } from "locklift";

import { TestWeverVaultAbi } from "../../../build/factorySource";
import { WEVER_WALLET_AMOUNT } from "../../../utils/consts";

export default async () => {
  const weverOwner = locklift.deployments.getAccount("DexOwner");
  const weverVault =
    locklift.deployments.getContract<TestWeverVaultAbi>("weverVault");

  console.log("wrapping tokens...");

  await weverVault.methods
    .wrap({
      payload: "",
      gas_back_address: weverOwner.account.address,
      tokens: toNano(WEVER_WALLET_AMOUNT),
      owner_address: weverOwner.account.address,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(WEVER_WALLET_AMOUNT + 2),
    });

  const balance = await weverVault.methods.total_wrapped().call();

  console.log(balance, "tokens are wrapped local");
};

export const tag = "wrap-ever";

export const dependencies = ["wever"];
