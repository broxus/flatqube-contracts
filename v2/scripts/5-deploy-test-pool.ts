import { TTokenName } from "../../utils/consts";
import { Command } from "commander";
import {
  DexAccountAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { depositLiquidity } from "../../utils/wrappers";
import { createStablePool } from "../../utils/deploy.utils";

import BigNumber from "bignumber.js";

const program = new Command();

async function main() {
  await locklift.deployments.load();

  const owner = locklift.deployments.getAccount("DexOwner").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(owner.address, {
      compute: [100],
    });
  }

  program
    .allowUnknownOption()
    .option("-p, --pools <pairs>", "pools to deploy")
    .option(
      "-cn, --contract_name <contract_name>",
      "New version of contract name",
    )
    .option(
      "-d, --deposit <deposit>",
      "deposit initial balance to pairs or not",
    );

  program.parse(process.argv);

  const options = program.opts();
  options.contract_name = options.contract_name || "DexStablePool";
  options.deposit = options.deposit || false;

  const pools: TTokenName[][] = options.pools
    ? JSON.parse(options.pools)
    : [["foo", "bar", "qwe"]];

  for (const p of pools) {
    const poolName =
      `DexStablePool_` + p.map(symbol => `token-${symbol}`).join("_");
    console.log(`Start deploy ${poolName}`);

    const tokens = p.map(symbol =>
      locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${symbol}`,
      ),
    );

    const { address: dexPoolAddress } = await createStablePool(
      tokens.map(root => root.address),
    );

    console.log(`${poolName}: ${dexPoolAddress}`);

    const dexPool = locklift.factory.getDeployedContract(
      "DexStablePool",
      dexPoolAddress,
    );
    await locklift.deployments.saveContract({
      contractName: options.contract_name,
      deploymentName: poolName,
      address: dexPool.address,
    });

    const version = (await dexPool.methods.getVersion({ answerId: 0 }).call())
      .version;
    console.log(`${poolName} version = ${version}`);

    const active = (await dexPool.methods.isActive({ answerId: 0 }).call())
      .value0;
    console.log(`${poolName} active = ${active}`);

    if (active && options.deposit) {
      const dexAccount =
        locklift.deployments.getContract<DexAccountAbi>(`OwnerDexAccount`);
      const decimals = await Promise.all(
        tokens.map(root =>
          root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        ),
      );
      await depositLiquidity(
        owner.address,
        dexAccount,
        dexPool,
        tokens.map((root, i) => {
          return {
            root: root.address,
            amount: new BigNumber(100).shiftedBy(decimals[i]).toString(),
          };
        }),
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
