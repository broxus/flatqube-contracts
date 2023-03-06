import { toNano } from 'locklift';
import { Migration, Constants, displayTx } from '../utils/migration';
import { Command } from 'commander';

const program = new Command();

async function main() {
  console.log('5-deploy-test-pair.js');
  const migration = new Migration();

  const account2 = await migration.loadAccount('Account1', '0');

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account2.address, {
      compute: [100],
    });
  }

  const dexRoot = await migration.loadContract('DexRoot', 'DexRoot');

  program
    .allowUnknownOption()
    .option('-p, --pairs <pairs>', 'pairs to deploy')
    .option(
      '-cn, --contract_name <contract_name>',
      'New version of contract name',
    );

  program.parse(process.argv);

  const options = program.opts();
  options.contract_name = options.contract_name || 'DexPair';

  const pairs = options.pairs ? JSON.parse(options.pairs) : [['foo', 'bar']];

  for (const p of pairs) {
    const tokenLeft =
      p[0].slice(-2) === 'Lp'
        ? {
            name: p[0],
            symbol: p[0],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[p[0]];
    const tokenRight =
      p[1].slice(-2) === 'Lp'
        ? {
            name: [p[1]],
            symbol: p[1],
            decimals: Constants.LP_DECIMALS,
            upgradeable: true,
          }
        : Constants.tokens[p[1]];

    const pair = { left: tokenLeft.symbol, right: tokenRight.symbol };

    console.log(`Start deploy pair DexPair${pair.left}${pair.right}`);

    const tokenFoo = await migration.loadContract(
      'TokenRootUpgradeable',
      pair.left + 'Root',
    );
    const tokenBar = await migration.loadContract(
      'TokenRootUpgradeable',
      pair.right + 'Root',
    );

    const tx = await dexRoot.methods
      .deployPair({
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
        send_gas_to: account2.address,
      })
      .send({
        from: account2.address,
        amount: toNano(15),
      });

    displayTx(tx);

    const dexPairFooBarAddress = await dexRoot.methods
      .getExpectedPairAddress({
        answerId: 0,
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
      })
      .call()
      .then((r) => r.value0);

    console.log(`DexPool${pair.left}${pair.right}: ${dexPairFooBarAddress}`);

    const dexPairFooBar = await locklift.factory.getDeployedContract(
      'DexPair',
      dexPairFooBarAddress,
    );
    migration.store(dexPairFooBar, 'DexPool' + pair.left + pair.right);

    const version = (
      await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
    ).version;
    console.log(`DexPool${pair.left}${pair.right} version = ${version}`);

    const active = (
      await dexPairFooBar.methods.isActive({ answerId: 0 }).call()
    ).value0;
    console.log(`DexPool${pair.left}${pair.right} active = ${active}`);

    const FooBarLpRoot = await locklift.factory.getDeployedContract(
      'TokenRootUpgradeable',
      (
        await dexPairFooBar.methods.getTokenRoots({ answerId: 0 }).call()
      ).lp,
    );

    const FooPairWallet = await locklift.factory.getDeployedContract(
      'TokenWalletUpgradeable',
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
      'TokenWalletUpgradeable',
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
      'TokenWalletUpgradeable',
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
      'TokenWalletUpgradeable',
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
      'TokenWalletUpgradeable',
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
      'TokenWalletUpgradeable',
      (
        await FooBarLpRoot.methods
          .walletOf({
            answerId: 0,
            walletOwner: FooBarLpTokenVault,
          })
          .call()
      ).value0,
    );

    migration.store(FooBarLpRoot, pair.left + pair.right + 'LpRoot');
    migration.store(
      FooPairWallet,
      pair.left + pair.right + 'Pool_' + pair.left + 'Wallet',
    );
    migration.store(
      BarPairWallet,
      pair.left + pair.right + 'Pool_' + pair.right + 'Wallet',
    );
    migration.store(
      FooBarLpPairWallet,
      pair.left + pair.right + 'Pool_LpWallet',
    );
    migration.store(FooVaultWallet, pair.left + 'VaultWallet');
    migration.store(BarVaultWallet, pair.right + 'VaultWallet');
    migration.store(
      FooBarLpVaultWallet,
      pair.left + pair.right + 'LpVaultWallet',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
