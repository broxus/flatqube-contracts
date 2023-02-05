import { Address, toNano } from 'locklift';
import { Migration } from '../../utils/migration';
import { yellowBright } from 'chalk';
import accounts from './dex_accounts.json';

const main = async () => {
  const migration = new Migration();

  const owner = await migration.loadAccount('Account1', '0');
  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  console.log(`Start force upgrade DexAccounts. Count = ${accounts.length}`);

  const { traceTree } = await locklift.tracing.trace(
    dexRoot.methods
      .upgradeAccounts({
        _accountsOwners: accounts.map((a) => new Address(a.owner)),
        _offset: 0,
        _remainingGasTo: owner.address,
      })
      .send({
        from: owner.address,
        amount: toNano(accounts.length * 3.5),
      }),
  );

  for (const account of accounts) {
    const DexAccount = locklift.factory.getDeployedContract(
      'DexAccount',
      new Address(account.dexAccount),
    );

    const events = traceTree.findEventsForContract({
      contract: DexAccount,
      name: 'AccountCodeUpgraded' as const,
    });

    if (events.length > 0) {
      console.log(
        `DexAccount ${account.dexAccount} upgraded. Current version: ${events[0].version}`,
      );
    } else {
      console.log(
        yellowBright(`DexAccount ${account.dexAccount} wasn't upgraded`),
      );
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
