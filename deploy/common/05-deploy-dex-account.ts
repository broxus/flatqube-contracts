import { toNano } from "locklift";
import { DexRootAbi } from "../../build/factorySource";
import { displayTx } from "../../v2/utils/migration";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const tx = await locklift.transactions.waitFinalized(
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

  displayTx(tx.extTransaction);

  const dexAccountNAddress = (
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
    address: dexAccountNAddress,
  });
};

export const tag = "dex-account";

export const dependencies = ["owner-account", "token-factory"];
