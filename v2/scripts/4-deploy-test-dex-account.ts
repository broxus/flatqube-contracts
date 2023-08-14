import { toNano } from "locklift";
import { Command } from "commander";
import { DexRootAbi } from "../../build/factorySource";

const program = new Command();

program
  .allowUnknownOption()
  .option("-o, --owner_n <owner_n>", "owner number")
  .option("-cn, --contract_name <contract_name>", "DexAccount contract name");

program.parse(process.argv);

const options = program.opts();

options.owner_n = options.owner_n ? +options.owner_n : 2;
options.contract_name = options.contract_name || "DexAccount";

async function main() {
  const accountN = locklift.deployments.getAccount(
    "Account" + options.owner_n,
  ).account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(accountN.address, {
      compute: [100],
    });
  }

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  await dexRoot.methods
    .deployAccount({
      account_owner: accountN.address,
      send_gas_to: accountN.address,
    })
    .send({
      from: accountN.address,
      amount: toNano(4),
    });

  const dexAccountNAddress = (
    await dexRoot.methods
      .getExpectedAccountAddress({
        answerId: 0,
        account_owner: accountN.address,
      })
      .call()
  ).value0;
  console.log(`DexAccount${options.owner_n}: ${dexAccountNAddress}`);
  const dexAccountN = locklift.factory.getDeployedContract(
    options.contract_name,
    dexAccountNAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexAccount",
    deploymentName: "DexAccount" + options.owner_n,
    address: dexAccountN.address,
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
