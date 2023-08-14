import { toNano } from "locklift";
import { displayTx } from "../../utils/helpers";
import { Constants, TTokenName } from "../../utils/consts";
import { Command } from "commander";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";

const program = new Command();

async function main() {
  console.log("5-deploy-test-pair.js");
  const account2 = locklift.deployments.getAccount("Account1").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account2.address, {
      compute: [100],
    });
  }

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  program
    .allowUnknownOption()
    .option("-p, --pairs <pairs>", "pairs to deploy")
    .option(
      "-cn, --contract_name <contract_name>",
      "New version of contract name",
    );

  program.parse(process.argv);

  const options = program.opts();
  options.contract_name = options.contract_name || "DexPair";

  const pairs: TTokenName[][] = options.pairs
    ? JSON.parse(options.pairs)
    : [["foo", "bar"]];

  for (const p of pairs) {
    const tokenLeft =
      p[0].slice(-2) === "Lp"
        ? {
            name: p[0],
            symbol: p[0],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[p[0]];
    const tokenRight =
      p[1].slice(-2) === "Lp"
        ? {
            name: [p[1]],
            symbol: p[1],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[p[1]];

    const pair = { left: tokenLeft.symbol, right: tokenRight.symbol };

    console.log(`Start deploy pair DexPair${pair.left}${pair.right}`);

    const tokenFoo = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      pair.left + "Root",
    );
    const tokenBar = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      pair.right + "Root",
    );

    const { extTransaction: tx } = await locklift.transactions.waitFinalized(
      dexRoot.methods
        .deployPair({
          left_root: tokenFoo.address,
          right_root: tokenBar.address,
          send_gas_to: account2.address,
        })
        .send({
          from: account2.address,
          amount: toNano(15),
        }),
    );

    displayTx(tx);

    const dexPairFooBarAddress = await dexRoot.methods
      .getExpectedPairAddress({
        answerId: 0,
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
      })
      .call()
      .then(r => r.value0);

    console.log(`DexPool${pair.left}${pair.right}: ${dexPairFooBarAddress}`);

    const dexPairFooBar = locklift.factory.getDeployedContract(
      "DexPair",
      dexPairFooBarAddress,
    );
    await locklift.deployments.saveContract({
      contractName: "DexPair",
      deploymentName: "DexPool" + pair.left + pair.right,
      address: dexPairFooBar.address,
    });

    const version = (
      await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
    ).version;
    console.log(`DexPool${pair.left}${pair.right} version = ${version}`);

    const active = (
      await dexPairFooBar.methods.isActive({ answerId: 0 }).call()
    ).value0;
    console.log(`DexPool${pair.left}${pair.right} active = ${active}`);

    const FooBarLpRoot = await locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      (
        await dexPairFooBar.methods.getTokenRoots({ answerId: 0 }).call()
      ).lp,
    );

    const FooPairWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await tokenFoo.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexPairFooBarAddress,
          })
          .call()
      ).value0,
    );

    const BarPairWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await tokenBar.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexPairFooBarAddress,
          })
          .call()
      ).value0,
    );

    const FooBarLpPairWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await FooBarLpRoot.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexPairFooBarAddress,
          })
          .call()
      ).value0,
    );

    const FooTokenVault = (
      await dexRoot.methods
        .getExpectedTokenVaultAddress({
          answerId: 0,
          _tokenRoot: tokenFoo.address,
        })
        .call()
    ).value0;

    const FooVaultWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await tokenFoo.methods
          .walletOf({
            answerId: 0,
            walletOwner: FooTokenVault,
          })
          .call()
      ).value0,
    );

    const BarTokenVault = (
      await dexRoot.methods
        .getExpectedTokenVaultAddress({
          answerId: 0,
          _tokenRoot: tokenBar.address,
        })
        .call()
    ).value0;

    const BarVaultWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await tokenBar.methods
          .walletOf({
            answerId: 0,
            walletOwner: BarTokenVault,
          })
          .call()
      ).value0,
    );

    const FooBarLpTokenVault = (
      await dexRoot.methods
        .getExpectedTokenVaultAddress({
          answerId: 0,
          _tokenRoot: FooBarLpRoot.address,
        })
        .call()
    ).value0;

    const FooBarLpVaultWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await FooBarLpRoot.methods
          .walletOf({
            answerId: 0,
            walletOwner: FooBarLpTokenVault,
          })
          .call()
      ).value0,
    );

    locklift.deployments.deploymentsStore = {
      ["DexPool" + pair.left + pair.right]: FooBarLpPairWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.left + pair.right + "Pool_" + pair.left + "Wallet"]: FooPairWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.left + pair.right + "Pool_" + pair.right + "Wallet"]: BarPairWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.left + pair.right + "Pool_LpWallet"]: FooBarLpPairWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.left + "VaultWallet"]: FooVaultWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.right + "VaultWallet"]: BarVaultWallet,
    };
    locklift.deployments.deploymentsStore = {
      [pair.left + pair.right + "LpVaultWallet"]: FooBarLpVaultWallet,
    };
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
