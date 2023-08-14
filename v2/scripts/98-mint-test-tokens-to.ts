import { toNano } from "locklift";
import { Command } from "commander";
import { BigNumber } from "bignumber.js";
import { Constants, EMPTY_TVM_CELL, TTokenName } from "../../utils/consts";
import {
  TokenRootAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";

const program = new Command();
BigNumber.config({ EXPONENTIAL_AT: 257 });

async function main() {
  const rootOwner = locklift.deployments.getAccount("Account1").account;

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
    const token = Constants.tokens[mint.token as TTokenName];
    const amount = new BigNumber(mint.amount)
      .shiftedBy(token.decimals)
      .toFixed();

    const tokenRoot = token.upgradeable
      ? locklift.deployments.getContract<TokenRootUpgradeableAbi>(
          token.symbol + "Root",
        )
      : locklift.deployments.getContract<TokenRootAbi>(token.symbol + "Root");

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
