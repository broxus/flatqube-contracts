import { toNano, WalletTypes } from 'locklift';

import { Migration, displayTx } from '../utils/migration';
import { Command } from 'commander';
const program = new Command();

program
  .allowUnknownOption()
  .option(
    '-rcn, --root_contract_name <root_contract_name>',
    'DexRoot contract name',
  )
  .option(
    '-pcn, --pair_contract_name <pair_contract_name>',
    'DexPair contract name',
  )
  .option(
    '-acn, --account_contract_name <account_contract_name>',
    'DexAccount contract name',
  )
  .option('-o, --new_owner <new_owner>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.vault_contract_name = options.vault_contract_name || 'DexVault';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

let tx;

async function main() {
  if (options.new_owner) {
    const migration = new Migration();
    const account = await migration.loadAccount('Account1', '0');
    const dexRoot = migration.loadContract(
      options.root_contract_name,
      'DexRoot',
    );
    const dexVault = migration.loadContract(
      options.vault_contract_name,
      'DexVault',
    );

    console.log(`Account address: ${account.address}`);
    console.log(`DexRoot address: ${dexRoot.address}`);
    console.log(`DexVault address: ${dexVault.address}`);

    console.log(
      `Transferring DEX ownership from ${account.address} to ${options.new_owner}`,
    );

    console.log(`Transfer ownership for DexRoot`);
    await dexRoot.methods
      .transferOwner({
        new_owner: options.new_owner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });

    console.log(`Transfer ownership for DexVault`);
    await dexVault.methods
      .transferOwner({
        new_owner: options.new_owner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
  } else {
    console.log('REQUIRED: --new_owner <new_owner>');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
