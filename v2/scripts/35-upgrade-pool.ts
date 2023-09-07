import { Command } from "commander";

import {
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { displayTx } from "../../utils/helpers";
import { upgradePool } from "../../utils/upgrade.utils";
import { Contract } from "locklift";

const program = new Command();

program
  .allowUnknownOption()
  .option("-r, --roots <roots>", "Pair's tokens symbols")
  .option(
    "-ocn, --old_contract_name <old_contract_name>",
    "Old pair's contract name",
  )
  .option(
    "-ncn, --new_contract_name <new_contract_name>",
    "New pair's contract name",
  )
  .option("-pt, --pool_type <pool_type>", "Pool type");

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots
  ? JSON.parse(options.roots)
  : ["foo", "bar", "qwe"];
options.old_contract_name = options.old_contract_name || "DexStablePoolPrev";
options.new_contract_name = options.new_contract_name || "DexStablePool";

async function main() {
  await locklift.deployments.load();

  const tokens: Contract<TokenRootUpgradeableAbi>[] = options.roots.map(
    (symbol: string) => locklift.deployments.getContract(`token-${symbol}`),
  );
  const poolName =
    `DexStablePool_` +
    options.roots.map((symbol: string) => `token-${symbol}`).join("_");
  const dexPool = locklift.deployments.getContract<DexStablePoolAbi>(poolName);

  const oldVersion = await dexPool.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.version);
  const oldPoolType = await dexPool.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => a.value0);

  const tx = await upgradePool(
    tokens.map(root => root.address),
    locklift.factory.getContractArtifacts(options.new_contract_name),
    3, // stable pool type
  );
  displayTx(tx);

  const newVersion = await dexPool.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.version);
  const newPoolType = await dexPool.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => a.value0);

  console.log(`Upgraded stable pool contract ${dexPool.address}:\n
      - old version: ${oldVersion}
      - old pool type: ${oldPoolType}
      - new version: ${newVersion}
      - new pool type: ${newPoolType}`);

  await locklift.deployments.saveContract({
    contractName: options.new_contract_name,
    deploymentName: poolName,
    address: dexPool.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
