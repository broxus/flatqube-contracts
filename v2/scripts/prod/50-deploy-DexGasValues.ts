import { displayTx, Migration } from '../../utils/migration';
import { toNano, getRandomNonce, Address } from 'locklift';
import { Command } from 'commander';

async function main() {
  const program = new Command();
  const migration = new Migration();

  program.allowUnknownOption().option('-o, --owner <owner>', 'owner');
  program.parse(process.argv);
  const options = program.opts();

  const newOwner = new Address(options.owner);

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

  console.log(`Transfer ownership for DexGasValues: ${gasValues.address}`);
  const tx = await gasValues.methods
    .transferOwner({
      new_owner: newOwner,
    })
    .send({
      from: account.address,
      amount: toNano(1),
    });
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
