import { displayTx } from "../utils/helpers";
import { Address, toNano } from "locklift";
import { DexRootAbi } from "../build/factorySource";

const MANAGER = new Address(
  "0:30b833a0dbb28f79d461e6a1d5818b748c20eb9ab32286c03a7652a555d9a996",
);

async function main() {
  await locklift.deployments.load();
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const tx = await dexRoot.methods.setManager({ _newManager: MANAGER }).send({
    from: owner.address,
    amount: toNano(1),
  });

  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
