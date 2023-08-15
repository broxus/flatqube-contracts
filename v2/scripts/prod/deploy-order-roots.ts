import { OrderFactoryAbi } from "build/factorySource";
import { Address } from "locklift";
import manifest from "../../../manifest.json";

async function main() {
  const factoryOrder =
    locklift.deployments.getContract<OrderFactoryAbi>("OrderFactory");
  const account = locklift.deployments.getAccount("Account1").account;

  for (const elTokens of manifest.tokens) {
    await factoryOrder.methods
      .createOrderRoot({ token: new Address(elTokens.address), callbackId: 0 })
      .send({
        amount: locklift.utils.toNano(6),
        from: account.address,
      });
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
