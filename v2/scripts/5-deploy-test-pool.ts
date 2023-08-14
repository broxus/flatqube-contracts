import { toNano } from "locklift";
import { displayTx } from "../../utils/helpers";
import { Constants, TTokenName } from "../../utils/consts";
import {
  DexRootAbi,
  TokenRootAbi,
  TokenRootUpgradeableAbi,
} from "../../build/factorySource";

import { Command } from "commander";
const program = new Command();

async function main() {
  console.log("6-deploy-test-pool.js");
  const account = locklift.deployments.getAccount("Account1").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  program
    .allowUnknownOption()
    .option("-p, --pools <pools>", "pools to deploy")
    .option(
      "-cn, --contract_name <contract_name>",
      "New version of contract name",
    );

  program.parse(process.argv);

  const options = program.opts();
  options.contract_name = options.contract_name || "DexStablePool";

  const pools: TTokenName[][] = options.pools
    ? JSON.parse(options.pools)
    : [["foo", "bar", "qwe"]];

  for (const p of pools) {
    const N_COINS = p.length;

    const tokens = [];
    let poolName = "";
    for (const item of p) {
      tokens.push(Constants.tokens[item]);
      poolName += Constants.tokens[item].symbol;
    }

    console.log(`Start deploy pool DexStablePool${poolName}`);

    const tokenContracts = [];
    const tokenAddresses = [];

    for (const token of tokens) {
      const tokenContract = token.upgradeable
        ? locklift.deployments.getContract<TokenRootUpgradeableAbi>(
            token.symbol + "Root",
          )
        : locklift.deployments.getContract<TokenRootAbi>(token.symbol + "Root");

      tokenContracts.push(tokenContract);
      tokenAddresses.push(tokenContract.address);
    }

    const { extTransaction: tx } = await locklift.transactions.waitFinalized(
      dexRoot.methods
        .deployStablePool({
          roots: tokenAddresses,
          send_gas_to: account.address,
        })
        .send({
          from: account.address,
          amount: toNano(20),
        }),
    );

    displayTx(tx);

    const dexPoolAddress = (
      await dexRoot.methods
        .getExpectedPoolAddress({
          answerId: 0,
          _roots: tokenAddresses,
        })
        .call()
    ).value0;

    console.log(`DexPool${poolName}: ${dexPoolAddress}`);

    const DexPool = await locklift.factory.getDeployedContract<"DexStablePool">(
      options.contract_name,
      dexPoolAddress,
    );
    await locklift.deployments.saveContract({
      contractName: "DexStablePool",
      deploymentName: "DexPool" + poolName,
      address: DexPool.address,
    });

    const version = (await DexPool.methods.getVersion({ answerId: 0 }).call())
      .version;
    console.log(`DexPool${poolName} version = ${version}`);

    await new Promise(resolve => setTimeout(resolve, 10000));

    const active = (await DexPool.methods.isActive({ answerId: 0 }).call())
      .value0;
    console.log(`DexPool${poolName} active = ${active}`);

    const DexPoolLpRoot = locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      (await DexPool.methods.getTokenRoots({ answerId: 0 }).call()).lp,
    );

    locklift.deployments.deploymentsStore = {
      [poolName + "LpRoot"]: DexPoolLpRoot,
    };
    for (let i = 0; i < N_COINS; i++) {
      const tokenWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenContracts[i].methods
            .walletOf({
              answerId: 0,
              walletOwner: dexPoolAddress,
            })
            .call()
        ).value0,
      );

      locklift.deployments.deploymentsStore = {
        [poolName + "Pool_" + tokens[i].symbol + "Wallet"]: tokenWallet,
      };

      const coinTokenVault = (
        await dexRoot.methods
          .getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: tokenAddresses[i],
          })
          .call()
      ).value0;

      const tokenVaultWallet = await locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenContracts[i].methods
            .walletOf({
              answerId: 0,
              walletOwner: coinTokenVault,
            })
            .call()
        ).value0,
      );

      locklift.deployments.deploymentsStore = {
        [tokens[i].symbol + "VaultWallet"]: tokenVaultWallet,
      };
    }

    const DexPoolLpPoolWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await DexPoolLpRoot.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexPoolAddress,
          })
          .call()
      ).value0,
    );

    locklift.deployments.deploymentsStore = {
      [poolName + "Pool_LpWallet"]: DexPoolLpPoolWallet,
    };

    const dexPoolLpTokenVault = (
      await dexRoot.methods
        .getExpectedTokenVaultAddress({
          answerId: 0,
          _tokenRoot: DexPoolLpRoot.address,
        })
        .call()
    ).value0;

    const DexPoolLpVaultWallet = await locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      (
        await DexPoolLpRoot.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexPoolLpTokenVault,
          })
          .call()
      ).value0,
    );

    locklift.deployments.deploymentsStore = {
      [poolName + "LpVaultWallet"]: DexPoolLpVaultWallet,
    };
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
