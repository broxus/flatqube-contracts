import { writeFileSync } from "fs";
import { Address } from "locklift";
import { yellowBright } from "chalk";
import { DexRootAbi } from "build/factorySource";

const OLD_DEX_POOL_CODE_HASH =
  "c186a348418ddf13dfbf70eb48c13e4a2d86d2e8495a89e924a39c81ec8903e9";

type PoolEntity = {
  dexPool: Address;
  tokenRoots: Address[];
};

async function exportDexPairs() {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  console.log("DexRoot: " + dexRoot.address);

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
      new Promise(async resolve => {
        const DexStablePool = locklift.factory.getDeployedContract(
          "DexStablePool",
          dexPoolAddress,
        );

        const root = await DexStablePool.methods
          .getRoot({ answerId: 0 })
          .call({})
          .then(r => r.dex_root.toString())
          .catch(e => {
            console.error(e);
            return "";
          });

        if (root === dexRoot.address.toString()) {
          const roots = (
            await DexStablePool.methods.getTokenRoots({ answerId: 0 }).call()
          ).roots;

          const rootString = roots.map(e => e.toString()).join(",");

          console.log(`DexStablePool ${dexPoolAddress}, roots = ${rootString}`);

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
    "./dex_pools.json",
    JSON.stringify(
      pairs.filter(v => !!v),
      null,
      2,
    ),
  );
}

exportDexPairs()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
