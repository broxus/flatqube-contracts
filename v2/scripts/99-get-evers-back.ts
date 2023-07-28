import { Command } from 'commander';
import { Address, fromNano } from 'locklift';

import { Migration } from '../utils/migration';

const migration = new Migration();
const program = new Command();

program
  .allowUnknownOption()
  .option('-n, --key_number <key_number>', 'count of accounts');

program.parse(process.argv);

const main = async () => {
  const options = program.opts();
  const key_number = +(options.key_number || '0');

  const accountAddress = await migration.loadAccount(
    `Account${key_number + 1}`,
    (key_number + 1).toString(),
  );
  const pubKey = await locklift.keystore
    .getSigner(key_number.toString())
    .then((s) => s.publicKey);
  const account = locklift.factory.getDeployedContract(
    'EverWallet',
    accountAddress.address,
  );

  const giverAddress = locklift.context.network.config.giver.address;
  const balanceBefore = await locklift.provider.getBalance(account.address);

  await locklift.transactions.waitFinalized(
    account.methods
      .sendTransaction({
        dest: new Address(giverAddress),
        value: 0,
        bounce: false,
        flags: 128,
        payload: '',
      })
      .sendExternal({ publicKey: pubKey }),
  );

  const balanceAfter = await locklift.provider.getBalance(account.address);

  console.log(
    `[EVER Balance] ${account.address.toString()}: ${fromNano(
      balanceBefore,
    )} -> ${fromNano(balanceAfter)}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
