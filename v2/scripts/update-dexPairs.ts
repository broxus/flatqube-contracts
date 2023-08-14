import { toNano } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";

import { displayTx } from "../../utils/helpers";

async function main() {
  const account = locklift.deployments.getAccount("Account1").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const NewDexPair = locklift.factory.getContractArtifacts("DexPair");

  console.log(`Installing new DexPair contract in DexRoot: ${dexRoot.address}`);
  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .installOrUpdatePairCode({ code: NewDexPair.code, pool_type: 1 })
      .send({
        from: account.address,
        amount: toNano(1),
      }),
  );

  const pairs_to_update = [
    {
      left: locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        "CoinRoot",
      ),
      right:
        locklift.deployments.getContract<TokenRootUpgradeableAbi>("FooRoot"),
    },
    // {
    //   left: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('FooRoot')),
    //   right: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('BarRoot'))
    // },
    {
      left: locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        "CoinRoot",
      ),
      right:
        locklift.deployments.getContract<TokenRootUpgradeableAbi>("FooRoot"),
    },
  ];
  await Promise.all(
    pairs_to_update.map(async pair => {
      console.log(
        `Upgrading DexPair contract:\n\t- left=${pair.left.address}\n\t- right=${pair.right.address}`,
      );

      const { extTransaction: tx } = await locklift.transactions.waitFinalized(
        dexRoot.methods
          .upgradePair({
            left_root: pair.left.address,
            right_root: pair.right.address,
            pool_type: 1,
            send_gas_to: account.address,
          })
          .send({
            from: account.address,
            amount: toNano(6),
          }),
      );
      displayTx(tx);
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
