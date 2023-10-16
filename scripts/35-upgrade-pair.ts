import { Command } from "commander";

import { DexPairAbi, TokenRootUpgradeableAbi } from "../build/factorySource";
import { displayTx } from "../utils/helpers";
import { upgradePair } from "../utils/upgrade.utils";
import {Constants} from "../utils/consts";

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

options.roots = options.roots ? JSON.parse(options.roots) : ["foo", "bar"];
options.old_contract_name = options.old_contract_name || "DexPairPrev";
options.new_contract_name = options.new_contract_name || "DexPair";
options.pool_type = options.pool_type || "1";

async function main() {
  await locklift.deployments.load();

  const tokenLeftSymbol = Constants.tokens[options.roots[0]]
      ? Constants.tokens[options.roots[0]].symbol
      : options.roots[0];
  const tokenRightSymbol = Constants.tokens[options.roots[1]]
      ? Constants.tokens[options.roots[1]].symbol
      : options.roots[1];
  const tokenLeft = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
    `token-${tokenLeftSymbol}`,
  );
  const tokenRight = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
    `token-${tokenRightSymbol}`,
  );
  const dexPair = locklift.deployments.getContract<DexPairAbi>(
    `DexPair_token-${tokenLeftSymbol}_token-${tokenRightSymbol}`,
  );
  const oldVersion = await dexPair.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.version);
  const oldPoolType = await dexPair.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => a.value0);

  const tx = await upgradePair(
    tokenLeft.address,
    tokenRight.address,
    locklift.factory.getContractArtifacts(options.new_contract_name),
    options.pool_type,
  );
  displayTx(tx);

  const newVersion = await dexPair.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.version);
  const newPoolType = await dexPair.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => a.value0);

  console.log(`Upgraded pair contract ${dexPair.address}:\n
      - old version: ${oldVersion}
      - old pool type: ${oldPoolType}
      - new version: ${newVersion}
      - new pool type: ${newPoolType}`);

  await locklift.deployments.saveContract({
    contractName: options.new_contract_name,
    deploymentName: `DexPair_token-${options.roots[0]}_token-${options.roots[1]}`,
    address: dexPair.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
