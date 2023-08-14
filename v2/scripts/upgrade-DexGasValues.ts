import { toNano } from "locklift";
import { displayTx } from "../../utils/helpers";
import { DexGasValuesAbi } from "../../build/factorySource";

async function main() {
  const account = locklift.deployments.getAccount("Account1").account;
  const dexGasPrev =
    locklift.deployments.getContract<DexGasValuesAbi>("DexVault");

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
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
