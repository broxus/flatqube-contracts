import { toNano } from "locklift";
import { Constants, EMPTY_TVM_CELL, TTokenName } from "../../utils/consts";
import { Command } from "commander";
import { TokenRootUpgradeableAbi } from "../../build/factorySource";

const program = new Command();
import { BigNumber } from "bignumber.js";
import { getWallet } from "../../utils/wrappers";
BigNumber.config({ EXPONENTIAL_AT: 257 });

async function main() {
  const rootOwner = locklift.deployments.getAccount("DexOwner").account;

  program.allowUnknownOption().option("-m, --mints <mints>", "mint params");

  program.parse(process.argv);

  const options = program.opts();

  const mints = options.mints
    ? JSON.parse(options.mints)
    : [
        {
          account: 2,
          amount: 20000,
          token: "foo",
        },
        {
          account: 2,
          amount: 20000,
          token: "bar",
        },
        {
          account: 2,
          amount: 20000,
          token: "tst",
        },
        {
          account: 3,
          amount: 110000,
          token: "foo",
        },
      ];

  for (const mint of mints) {
    const tokenSymbol = Constants.tokens[mint.token as TTokenName]
      ? Constants.tokens[mint.token as TTokenName].symbol
      : mint.token;

    const tokenRoot = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      `token-${tokenSymbol}`,
    );
    const decimals = await tokenRoot.methods
      .decimals({ answerId: 0 })
      .call()
      .then(a => Number(a.value0));

    const amount = new BigNumber(mint.amount).shiftedBy(decimals).toFixed();

    const account = locklift.deployments.getAccount(
      `commonAccount-${mint.account}`,
    ).account;

    await tokenRoot.methods
      .mint({
        amount: amount,
        recipient: account.address,
        deployWalletValue: toNano(0.2),
        remainingGasTo: rootOwner.address,
        notify: false,
        payload: EMPTY_TVM_CELL,
      })
      .send({
        from: rootOwner.address,
        amount: toNano(0.5),
      });

    const tokenWallet = await getWallet(
      account.address,
      tokenRoot.address,
    ).then(a => a.walletContract);

    // await locklift.deployments.saveContract({
    //   contractName: "TokenWalletUpgradeable",
    //   deploymentName: alias,
    //   address: tokenWallet.address,
    // });
    console.log(
      `wallet-${tokenSymbol}-${
        mint.account
      }: ${tokenWallet.address.toString()}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
