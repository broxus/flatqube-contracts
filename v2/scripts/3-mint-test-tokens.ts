import { toNano } from "locklift";
import { Constants, EMPTY_TVM_CELL, TTokenName } from "../../utils/consts";
import { Command } from "commander";
import {
  TokenRootAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";

const program = new Command();
import { BigNumber } from "bignumber.js";
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
    const token = Constants.tokens[mint.token as TTokenName];
    const account = locklift.deployments.getAccount(
      "Account" + mint.account,
    ).account;
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

    const tokenWalletAddress = (
      await tokenRoot.methods
        .walletOf({ answerId: 0, walletOwner: account.address })
        .call()
    ).value0;
    const tokenWallet = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      tokenWalletAddress,
    );
    const alias = token.symbol + "Wallet" + mint.account;
    await locklift.deployments.saveContract({
      contractName: "TokenWalletUpgradeable",
      deploymentName: alias,
      address: tokenWallet.address,
    });
    console.log(`${alias}: ${tokenWalletAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
