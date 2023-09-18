import { Address, toNano, WalletTypes } from 'locklift';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { yellowBright } from 'chalk';
import accounts from '../../../dex_accounts.json';
import { displayTx, Migration } from '../../utils/migration';

const TRACE = false;

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

const main = async () => {
  const migration = new Migration();

  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  const dexManagerAddress = await dexRoot.methods
    .getManager({ answerId: 0 })
    .call()
    .then((m) => m.value0);

  const manager = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: dexManagerAddress,
  });

  console.log('DexRoot:' + dexRoot.address);
  console.log('Manager:' + manager.address);

  console.log(`Start force upgrade DexAccounts. Count = ${accounts.length}`);

  const params = accounts.map((a) => ({
    owner: a.owner,
    account: a.dexAccount,
  }));

  for (const chunk of chunkify(params, 1000)) {
    const p = dexRoot.methods
      .upgradeAccounts({
        _accountsOwners: chunk.map((a) => new Address(a.owner)),
        _offset: 0,
        _remainingGasTo: manager.address,
      })
      .send({
        from: manager.address,
        amount: toNano(chunk.length * 5),
      });

    if (TRACE) {
      const { traceTree } = await locklift.tracing.trace(p);

      for (const account of chunk) {
        const DexAccount = locklift.factory.getDeployedContract(
          'DexAccount',
          new Address(account.account),
        );

        const events = traceTree.findEventsForContract({
          contract: DexAccount,
          name: 'AccountCodeUpgraded' as const,
        });

        if (events.length > 0) {
          console.log(
            `DexAccount ${account.account} upgraded. Current version: ${events[0].version}`,
          );
        } else {
          console.log(
            yellowBright(`DexAccount ${account.account} wasn't upgraded`),
          );
        }
      }
    } else {
      const tx = await locklift.transactions.waitFinalized(p);
      displayTx(tx.transactions[0]);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
