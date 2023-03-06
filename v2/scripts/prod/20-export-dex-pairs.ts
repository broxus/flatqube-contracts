import { writeFileSync } from 'fs';
import { Address, WalletTypes } from 'locklift';
import { yellowBright } from 'chalk';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Migration } = require(process.cwd() + '/scripts/utils');

const OLD_DEX_PAIR_CODE_HASH =
  'ae78ef937336fe0076a34e1d7d63710a06519cc251d56d27de6166c4c947c54c';

// const OLD_DEX_PAIR_CODE_HASH =
//   '9bffb97d8fcb584230bfa949b6c7e8fb9881f1ffb684e13f02d6fcd9ba3306c5';

type PairEntity = {
  dexPair: Address;
  left: Address;
  right: Address;
  lp: Address;
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
        codeHash: OLD_DEX_PAIR_CODE_HASH,
        continuation,
        limit: 50,
      });

    continuation = result.continuation;
    hasResults = result.accounts.length === 50;

    accounts.push(...result.accounts);
  }

  const promises: Promise<PairEntity | null>[] = [];

  for (const dexPairAddress of accounts) {
    promises.push(
      new Promise(async (resolve) => {
        const DexPair = await locklift.factory.getDeployedContract(
          'DexPair',
          dexPairAddress,
        );

        const root = await DexPair.methods
          .getRoot({ answerId: 0 })
          .call({})
          .then((r) => r.dex_root.toString())
          .catch((e) => {
            console.error(e);
            return '';
          });

        if (root === dexRoot.address.toString()) {
          const roots = await DexPair.methods
            .getTokenRoots({ answerId: 0 })
            .call();

          console.log(
            `DexPair ${dexPairAddress}, left = ${roots.left}, right = ${roots.right}, lp = ${roots.lp}`,
          );

          resolve({
            dexPair: dexPairAddress,
            left: roots.left,
            right: roots.right,
            lp: roots.lp,
          });
        } else {
          console.log(
            yellowBright(`DexPair ${dexPairAddress} has another root: ${root}`),
          );
          resolve(null);
        }
      }),
    );
  }

  const pairs = await Promise.all(promises);

  console.log(`Export took ${(Date.now() - start) / 1000} seconds`);

  writeFileSync(
    './dex_pairs.json',
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