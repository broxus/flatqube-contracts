import { TTokenName } from "../../utils/consts";
import { Command } from "commander";
import {
  DexAccountAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";
import { depositLiquidity } from "../../utils/wrappers";
import { createDexPair } from "../../utils/deploy.utils";

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
    .option("-p, --pairs <pairs>", "pairs to deploy")
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
  options.contract_name = options.contract_name || "DexPair";
  options.deposit = options.deposit || false;

  const pairs: TTokenName[][] = options.pairs
    ? JSON.parse(options.pairs)
    : [["foo", "bar"]];

  for (const p of pairs) {
    const pair = { left: p[0], right: p[1] };

    const pairName = `DexPair_token-${pair.left}_token-${pair.right}`;
    console.log(`Start deploy ${pairName}`);

    const tokenLeft = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      `token-${pair.left}`,
    );
    const tokenRight =
      locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${pair.right}`,
      );

    const dexPairAddress = await createDexPair(
      tokenLeft.address,
      tokenRight.address,
    );

    console.log(`${pairName}: ${dexPairAddress}`);

    const dexPair = locklift.factory.getDeployedContract(
      "DexPair",
      dexPairAddress,
    );
    await locklift.deployments.saveContract({
      contractName: options.contract_name,
      deploymentName: pairName,
      address: dexPair.address,
    });

    const version = (await dexPair.methods.getVersion({ answerId: 0 }).call())
      .version;
    console.log(`${pairName} version = ${version}`);

    const active = (await dexPair.methods.isActive({ answerId: 0 }).call())
      .value0;
    console.log(`${pairName} active = ${active}`);

    if (active && options.deposit) {
      const dexAccount =
        locklift.deployments.getContract<DexAccountAbi>(`OwnerDexAccount`);
      const decimals = await Promise.all(
        [tokenLeft, tokenRight].map(root =>
          root.methods
            .decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        ),
      );
      await depositLiquidity(
        owner.address,
        dexAccount,
        dexPair,
        [tokenLeft, tokenRight].map((root, i) => {
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
