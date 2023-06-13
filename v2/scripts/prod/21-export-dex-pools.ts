import { writeFileSync } from 'fs';
import { Address } from 'locklift';
import { yellowBright } from 'chalk';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Migration } = require(process.cwd() + '/scripts/utils');

const OLD_DEX_POOL_CODE_HASH =
  '6a388fbce37c45774c620667a9df96507579b07d4d0cd5378c39cb30f84406b3';

type PoolEntity = {
  dexPool: Address;
  tokenRoots: Address[];
};

async function exportDexPairs() {
  const migration = new Migration();

  const dexRoot = await locklift.factory.getDeployedContract(
    'DexRoot',
    migration.getAddress('DexRoot'),
  );

  console.log('DexRoot: ' + dexRoot.address);

  let continuation = undefined;
  let hasResults = true;
  const accounts: Address[] = [];

  const start = Date.now();

  while (hasResults) {
    const result: { accounts: Address[]; continuation: string } =
      await locklift.provider.getAccountsByCodeHash({
        codeHash: OLD_DEX_POOL_CODE_HASH,
        continuation,
        limit: 50,
      });

    continuation = result.continuation;
    hasResults = result.accounts.length === 50;

    accounts.push(...result.accounts);
  }

  const promises: Promise<PoolEntity | null>[] = [];

  for (const dexPoolAddress of accounts) {
    promises.push(
      new Promise(async (resolve) => {
        const DexStablePool = await locklift.factory.getDeployedContract(
          'DexStablePool',
          dexPoolAddress,
        );

        const root = await DexStablePool.methods
          .getRoot({ answerId: 0 })
          .call({})
          .then((r) => r.dex_root.toString())
          .catch((e) => {
            console.error(e);
            return '';
          });

        if (root === dexRoot.address.toString()) {
          const roots = (
            await DexStablePool.methods.getTokenRoots({ answerId: 0 }).call()
          ).roots;

          const rootString = roots.map((e) => e.toString()).join(',');

          console.log(`DexStablePool ${dexPoolAddress}, left = ${rootString}`);

          resolve({
            dexPool: dexPoolAddress,
            tokenRoots: roots,
          });
        } else {
          console.log(
            yellowBright(
              `DexStablePool ${dexPoolAddress} has another root: ${root}`,
            ),
          );
          resolve(null);
        }
      }),
    );
  }

  const pairs = await Promise.all(promises);

  console.log(`Export took ${(Date.now() - start) / 1000} seconds`);

  writeFileSync(
    './dex_pools.json',
    JSON.stringify(
      pairs.filter((v) => !!v),
      null,
      2,
    ),
  );
}

exportDexPairs()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
