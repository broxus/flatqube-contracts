import { writeFileSync } from 'fs';
import { Address } from 'locklift';
import { yellowBright } from 'chalk';

const OLD_DEX_PAIR_CODE_HASH =
  'd7f137ee2123785ed7dd56fad374ab7c0e99343eb97e918aac1bbc6bd9bb827b';
const DEX_ROOT_ADDRESS =
  '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

type PairEntity = {
  dexPair: Address;
  left: Address;
  right: Address;
  lp: Address;
};

async function exportDexPairs() {
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
          .then((r) => r.dex_root.toString());

        if (root === DEX_ROOT_ADDRESS) {
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
    './v2/scripts/prod/dex_pairs.json',
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
