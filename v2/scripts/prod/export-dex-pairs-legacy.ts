import { writeFileSync } from 'fs';
const { Migration } = require(process.cwd() + '/scripts/utils');

const OLD_DEX_PAIR_CODE_HASH =
  '9bffb97d8fcb584230bfa949b6c7e8fb9881f1ffb684e13f02d6fcd9ba3306c5';

async function exportDexPairs() {
  const migration = new Migration();

  const dexRoot = await locklift.factory.getDeployedContract(
    'DexRoot',
    migration.getAddress('DexRoot'),
  );

  const dexPairsToUpdate = [];
  let continuation = undefined;
  let hasResults = true;
  while (hasResults) {
    const result: any = await locklift.provider.getAccountsByCodeHash({
      codeHash: OLD_DEX_PAIR_CODE_HASH,
      continuation,
      limit: 50,
    });
    continuation = result.continuation;
    hasResults = result.accounts.length === 50;
    for (const dexPairAddress of result.accounts) {
      const DexPair = await locklift.factory.getDeployedContract(
        'DexPair',
        dexPairAddress,
      );
      const root = (
        await DexPair.methods.getRoot({ answerId: 0 }).call({})
      ).dex_root.toString();
      if (root === dexRoot.address.toString()) {
        const roots = await DexPair.methods
          .getTokenRoots({ answerId: 0 })
          .call();
        console.log(
          `DexPair ${dexPairAddress}, left = ${roots.left}, right = ${roots.right}, lp = ${roots.lp}`,
        );
        dexPairsToUpdate.push({
          dexPair: dexPairAddress,
          left: roots.left,
          right: roots.right,
          lp: roots.lp,
        });
      }
    }
  }

  writeFileSync(
    './v2/scripts/prod/dex_pairs.json',
    JSON.stringify(dexPairsToUpdate, null, 2),
  );
}

exportDexPairs()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
