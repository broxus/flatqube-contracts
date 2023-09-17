import { toNano } from "locklift";
import { Command } from "commander";
import { BigNumber } from "bignumber.js";
import { Constants, EMPTY_TVM_CELL } from "../../utils/consts";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";

const program = new Command();
BigNumber.config({ EXPONENTIAL_AT: 257 });

async function main() {
  await locklift.deployments.load();
  const rootOwner = locklift.deployments.getAccount("DexOwner").account;

  program
    .allowUnknownOption()
    .option("-m, --mints <mints>", "mint params")
    .option("-t, --to <to>", "mint params");

  program.parse(process.argv);

  const options = program.opts();

  const mints = options.mints
    ? JSON.parse(options.mints)
    : [
        {
          amount: 20000,
          token: "foo",
        },
      ];

  const to =
    options.to ||
    "0:0000000000000000000000000000000000000000000000000000000000000000";

  for (const mint of mints) {
    const tokenSymbol = Constants.tokens[mint.token]
      ? Constants.tokens[mint.token].symbol
      : mint.token;

    const tokenRoot = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      `token-${tokenSymbol}`,
    );
    const decimals = await tokenRoot.methods
      .decimals({ answerId: 0 })
      .call()
      .then(a => Number(a.value0));

    const amount = new BigNumber(mint.amount).shiftedBy(decimals).toFixed();

    await tokenRoot.methods
      .mint({
        amount: amount,
        recipient: to,
        deployWalletValue: toNano(0.2),
        remainingGasTo: rootOwner.address,
        notify: false,
        payload: EMPTY_TVM_CELL,
      })
      .send({
        from: rootOwner.address,
        amount: toNano(0.5),
      });
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
