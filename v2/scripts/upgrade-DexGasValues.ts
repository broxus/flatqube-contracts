import { displayTx, Migration } from '../utils/migration';
import { toNano } from 'locklift';

async function main() {
  const migration = new Migration();

  const signer = await locklift.keystore.getSigner('0');
  const account = await migration.loadAccount('Account1', '0');

  const dexGasPrev = await migration.loadContract(
    'DexGasValues',
    'DexGasValues',
  );

  const DexGas = await locklift.factory.getContractArtifacts('DexGasValues');

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
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
