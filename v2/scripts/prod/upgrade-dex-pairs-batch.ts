import { Address, toNano } from 'locklift';
import { Migration } from '../../utils/migration';
import { yellowBright } from 'chalk';
import pairs from './dex_pairs.json';

const main = async () => {
  const migration = new Migration();

  const owner = await migration.loadAccount('Account1', '0');
  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  console.log(`Start force upgrade DexPairs. Count = ${pairs.length}`);

  const params = pairs.map((p) => ({
    tokenRoots: [new Address(p.left), new Address(p.right)],
    poolType: 1,
  }));

  const { traceTree } = await locklift.tracing.trace(
    dexRoot.methods
      .upgradePairs({
        _params: params,
        _offset: 0,
        _remainingGasTo: owner.address,
      })
      .send({
        from: owner.address,
        amount: toNano(pairs.length * 3.5),
      }),
  );

  for (const pair of pairs) {
    const DexPair = locklift.factory.getDeployedContract(
      'DexPair',
      new Address(pair.dexPair),
    );

    const events = traceTree.findEventsForContract({
      contract: DexPair,
      name: 'PairCodeUpgraded' as const,
    });

    if (events.length > 0) {
      console.log(
        `DexPair ${pair.dexPair} upgraded. Current version: ${events[0].version}`,
      );
    } else {
      console.log(yellowBright(`DexPair ${pair.dexPair} wasn't upgraded`));
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
