import { Address, toNano, WalletTypes } from 'locklift';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Migration } = require(process.cwd() + '/scripts/utils');
import { yellowBright } from 'chalk';
import pairs from '../../../dex_pools.json';
import {displayTx} from "../../utils/migration";

const TRACE = false;

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

const main = async () => {
  const migration = new Migration();

  const dexRoot = await locklift.factory.getDeployedContract(
    'DexRoot',
    migration.getAddress('DexRoot'),
  );
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

  console.log(`Start force upgrade DexPairs. Count = ${pairs.length}`);

  const params = pairs.map((p) => ({
    tokenRoots: p.tokenRoots.map((tr) => new Address(tr)),
    poolType: 3,
    pool: p.dexPool,
  }));

  for (const chunk of chunkify(params, 1000)) {
    const p = dexRoot.methods
      .upgradePairs({
        _params: chunk.map((p) => ({
          tokenRoots: p.tokenRoots,
          poolType: p.poolType,
        })),
        _offset: 0,
        _remainingGasTo: manager.address,
      })
      .send({
        from: manager.address,
        amount: toNano(chunk.length * 5),
      });

    if (TRACE) {
      const { traceTree } = await locklift.tracing.trace(p);

      for (const pair of chunk) {
        const DexPool = locklift.factory.getDeployedContract(
          'DexStablePool',
          new Address(pair.pool),
        );

        const events = traceTree.findEventsForContract({
          contract: DexPool,
          name: 'PoolCodeUpgraded' as const,
        });

        if (events.length > 0) {
          console.log(
            `DexPair ${pair.pool} upgraded. Current version: ${events[0].version}`,
          );
        } else {
          console.log(
            yellowBright(`DexStablePool ${pair.pool} wasn't upgraded`),
          );
        }
      }
    } else {
      const tx = await locklift.transactions.waitFinalized(p);
      displayTx(tx);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
