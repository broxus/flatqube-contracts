import { Address, toNano, WalletTypes } from "locklift";
import { yellowBright } from "chalk";
import prompts from "prompts";
import { DexRootAbi } from "build/factorySource";

import pairs from "../../../dex_pairs.json";

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

const main = async (isActive: boolean) => {
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

  const params = pairs.map(p => ({
    tokenRoots: [new Address(p.left), new Address(p.right)],
    newActive: isActive,
    pool: p.dexPair,
  }));

  for (const chunk of chunkify(params, 20)) {
    const { traceTree } = await locklift.tracing.trace(
      dexRoot.methods
        .setPoolsActive({
          _params: chunk.map(p => ({
            tokenRoots: p.tokenRoots,
            newActive: p.newActive,
          })),
          _offset: 0,
          _remainingGasTo: manager.address,
        })
        .send({
          from: manager.address,
          amount: toNano(chunk.length * 3),
        }),
    );

    //await traceTree.beautyPrint();

    for (const pair of chunk) {
      const DexPair = locklift.factory.getDeployedContract(
        "DexPair",
        new Address(pair.pool),
      );

      const events = traceTree.findEventsForContract({
        contract: DexPair,
        name: "ActiveStatusUpdated" as const,
      });

      if (events.length > 0) {
        console.log(
          `DexPair ${pair.pool} active status updated: ${events[0].previous} -> ${events[0].current}`,
        );
      } else {
        console.log(
          yellowBright(`DexPair ${pair.pool} active status wasn't updated`),
        );
      }
    }
  }
};

prompts({ type: "toggle", name: "isActive", message: "Activate DEX pairs?" })
  .then(p => main(p.isActive))
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
