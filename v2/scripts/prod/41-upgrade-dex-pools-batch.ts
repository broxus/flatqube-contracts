import { Address, toNano, WalletTypes } from "locklift";
import { yellowBright } from "chalk";
import { DexRootAbi } from "build/factorySource";

import { displayTx } from "../../../utils/helpers";
import pools from "../../../dex_pools.json";

const TRACE = false;

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

const main = async () => {
  await locklift.deployments.load();
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const dexManagerAddress = await dexRoot.methods
    .getManager({ answerId: 0 })
    .call()
    .then(m => m.value0);

  const manager = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: dexManagerAddress,
  });

  console.log("DexRoot:" + dexRoot.address);
  console.log("Manager:" + manager.address);

  console.log(`Start force upgrade DexPools. Count = ${pools.length}`);

  const params = pools.map(p => ({
    tokenRoots: p.tokenRoots.map(tr => new Address(tr)),
    poolType: 3,
    pool: p.dexPool,
  }));

  for (const chunk of chunkify(params, 1000)) {
    const p = dexRoot.methods
      .upgradePools({
        _params: chunk.map(p => ({
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
          "DexStablePool",
          new Address(pair.pool),
        );

        const events = traceTree.findEventsForContract({
          contract: DexPool,
          name: "PoolCodeUpgraded" as const,
        });

        if (events.length > 0) {
          console.log(
            `DexPool ${pair.pool} upgraded. Current version: ${events[0].version}`,
          );
        } else {
          console.log(
            yellowBright(`DexStablePool ${pair.pool} wasn't upgraded`),
          );
        }
      }
    } else {
      const tx = await locklift.transactions.waitFinalized(p);
      displayTx(tx.extTransaction);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
