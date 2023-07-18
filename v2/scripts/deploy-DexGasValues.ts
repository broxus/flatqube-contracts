import { Migration } from '../utils/migration';
import { toNano, getRandomNonce } from 'locklift';

async function main() {
  const migration = new Migration();

  const signer = await locklift.keystore.getSigner('0');
  const account = await migration.loadAccount('Account1', '0');

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  const { contract: gasValues } = await locklift.factory.deployContract({
    contract: 'DexGasValues',
    constructorParams: {
      owner_: account.address,
    },
    initParams: {
      _nonce: getRandomNonce(),
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });
  migration.store(gasValues, 'DexGasValues');

  console.log(`DexGasValues: ${gasValues.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
