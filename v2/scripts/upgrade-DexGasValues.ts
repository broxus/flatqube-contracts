import { toNano } from "locklift";
import { displayTx } from "../../utils/helpers";
import { DexGasValuesPrevAbi } from "../../build/factorySource";

async function main() {
  await locklift.deployments.load();

  const account = locklift.deployments.getAccount("DexOwner").account;
  const dexGasPrev =
    locklift.deployments.getContract<DexGasValuesPrevAbi>("DexGasValues");

  const DexGas = await locklift.factory.getContractArtifacts("DexGasValues");

  const tx = await dexGasPrev.methods
    .upgrade({
      code: DexGas.code,
    })
    .send({
      from: account.address,
      amount: toNano(5),
    });

  displayTx(tx);

  await locklift.deployments.saveContract({
    contractName: "DexGasValues",
    deploymentName: "DexGasValues",
    address: dexGasPrev.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
