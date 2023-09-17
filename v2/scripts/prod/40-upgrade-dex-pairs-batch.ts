import { Address, toNano, WalletTypes } from "locklift";
import { yellowBright } from "chalk";
import { displayTx } from "../../../utils/helpers";
import { DexRootAbi } from "build/factorySource";

import pairs from "../../../dex_pairs.json";

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

  console.log(`Start force upgrade DexPairs. Count = ${pairs.length}`);

  const params = pairs.map(p => ({
    tokenRoots: [new Address(p.left), new Address(p.right)],
    poolType: 1,
    pool: p.dexPair,
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
        const DexPair = locklift.factory.getDeployedContract(
          "DexPair",
          new Address(pair.pool),
        );

        const events = traceTree.findEventsForContract({
          contract: DexPair,
          name: "PairCodeUpgraded" as const,
        });

        if (events.length > 0) {
          console.log(
            `DexPair ${pair.pool} upgraded. Current version: ${events[0].version}`,
          );
        } else {
          console.log(yellowBright(`DexPair ${pair.pool} wasn't upgraded`));
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
