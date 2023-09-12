import { Command } from "commander";

import { TokenRootUpgradeableAbi } from "../../build/factorySource";
import { displayTx } from "../../utils/helpers";
import { upgradeTokenVault } from "../../utils/upgrade.utils";
import { getExpectedTokenVaultAddress } from "../../utils/wrappers";

const program = new Command();

program
  .allowUnknownOption()
  .option("-t, --token <token>", "Token vault's token symbol")
  .option(
    "-ocn, --old_contract_name <old_contract_name>",
    "Old token vault's contract name",
  )
  .option(
    "-ncn, --new_contract_name <new_contract_name>",
    "New token vault's contract name",
  );

program.parse(process.argv);

const options = program.opts();

options.token = options.token || "foo";
options.old_contract_name = options.old_contract_name || "DexTokenVaultPrev";
options.new_contract_name = options.new_contract_name || "DexTokenVault";

async function main() {
  await locklift.deployments.load();

  const token = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
    `token-${options.token}`,
  );
  const dexTokenVault = locklift.factory.getDeployedContract(
    "DexTokenVault",
    await getExpectedTokenVaultAddress(token.address),
  );
  const oldVersion = await dexTokenVault.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.value0);

  const tx = await upgradeTokenVault(
    token.address,
    locklift.factory.getContractArtifacts(options.new_contract_name),
  );
  displayTx(tx);

  const newVersion = await dexTokenVault.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => a.value0);

  console.log(`Upgraded token vault contract ${dexTokenVault.address}:\n
      - old version: ${oldVersion}
      - new version: ${newVersion}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
