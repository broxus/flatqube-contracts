import { Address, toNano } from 'locklift';
import { Migration } from '../../utils/migration';
import { yellowBright } from 'chalk';
import prompts from 'prompts';
import pairs from './dex_pairs.json';

const main = async (isActive: boolean) => {
  const migration = new Migration();

  const owner = await migration.loadAccount('Account1', '0');
  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  const params = pairs.map((p) => ({
    tokenRoots: [new Address(p.left), new Address(p.right)],
    newActive: isActive,
  }));

  const { traceTree } = await locklift.tracing.trace(
    dexRoot.methods
      .setPoolsActive({
        _params: params,
        _offset: 0,
        _remainingGasTo: owner.address,
      })
      .send({
        from: owner.address,
        amount: toNano(pairs.length * 1.5),
      }),
  );

  for (const pair of pairs) {
    const DexPair = locklift.factory.getDeployedContract(
      'DexPair',
      new Address(pair.dexPair),
    );

    const events = traceTree.findEventsForContract({
      contract: DexPair,
      name: 'ActiveStatusUpdated' as const,
    });

    if (events.length > 0) {
      console.log(
        `DexPair ${pair.dexPair} active status updated: ${events[0].previous} -> ${events[0].current}`,
      );
    } else {
      console.log(
        yellowBright(`DexPair ${pair.dexPair} active status wasn't updated`),
      );
    }
  }
};

prompts({ type: 'toggle', name: 'isActive', message: 'Activate DEX pairs?' })
  .then((p) => main(p.isActive))
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
