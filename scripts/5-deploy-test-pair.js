const {Migration, TOKEN_CONTRACTS_PATH, Constants, afterRun, displayTx, calcValue} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

async function main() {
  console.log('5-deploy-test-pair.js');
  const migration = new Migration();
  const keyPairs = await locklift.keys.getKeyPairs();

  const account2 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account2');

  if (locklift.tracing) {
    locklift.tracing.allowCodes({compute: [100]});
  }

  const dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
  const gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');

  account2.afterRun = afterRun;

  program
      .allowUnknownOption()
      .option('-p, --pairs <pairs>', 'pairs to deploy')
      .option('-cn, --contract_name <contract_name>', 'New version of contract name');

  program.parse(process.argv);

  const options = program.opts();
  options.contract_name = options.contract_name || 'DexPair';

  const pairs = options.pairs ? JSON.parse(options.pairs) : [['foo', 'bar']];

  for (const p of pairs) {

    const tokenLeft = p[0].slice(-2) === 'Lp' ? {name: p[0], symbol: p[0], decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[p[0]];
    const tokenRight = p[1].slice(-2) === 'Lp' ? {name: [p[1]], symbol: p[1], decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[p[1]];

    const pair = {left: tokenLeft.symbol, right: tokenRight.symbol};

    console.log(`Start deploy pair DexPair${pair.left}${pair.right}`);

    const tokenFoo = migration.load(await locklift.factory.getContract(
        tokenLeft.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot',
        TOKEN_CONTRACTS_PATH
    ), pair.left + 'Root');
    const tokenBar = migration.load(await locklift.factory.getContract(
        tokenRight.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot',
        TOKEN_CONTRACTS_PATH
    ), pair.right + 'Root');

    const gas = await gasValues.call({
      method: 'getDeployPoolGas',
      params: {N: 2}
    });

    const tx = await account2.runTarget({
      contract: dexRoot,
      method: 'deployPair',
      params: {
        left_root: tokenFoo.address,
        right_root: tokenBar.address,
        send_gas_to: account2.address,
      },
      value: options.contract_name === 'DexPairPrev' ? locklift.utils.convertCrystal(15, 'nano') : calcValue(gas),
      keyPair: keyPairs[1]
    });

    displayTx(tx);

    await afterRun();

    const dexPairFooBarAddress = await dexRoot.call({
      method: 'getExpectedPairAddress',
      params: {
        'left_root': tokenFoo.address,
        'right_root': tokenBar.address,
      }
    })

    console.log(`DexPool${pair.left}${pair.right}: ${dexPairFooBarAddress}`);

    const dexPairFooBar = await locklift.factory.getContract(options.contract_name);
    dexPairFooBar.address = dexPairFooBarAddress;
    migration.store(dexPairFooBar, 'DexPool' + pair.left + pair.right);

    const version = await dexPairFooBar.call({method: "getVersion", params: {}})
    console.log(`DexPool${pair.left}${pair.right} version = ${version}`);

    // await new Promise(resolve => setTimeout(resolve, 10000));

    const active = await dexPairFooBar.call({method: "isActive", params: {}})
    console.log(`DexPool${pair.left}${pair.right} active = ${active}`);

    const FooBarLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
    FooBarLpRoot.setAddress((await dexPairFooBar.call({method: "getTokenRoots"})).lp);

    const FooPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    FooPairWallet.setAddress(await tokenFoo.call({
      method: "walletOf",
      params: {
        walletOwner: dexPairFooBarAddress,
      }
    }));

    const BarPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    BarPairWallet.setAddress(await tokenBar.call({
      method: "walletOf",
      params: {
        walletOwner: dexPairFooBarAddress,
      }
    }));

    const FooBarLpPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    FooBarLpPairWallet.setAddress(await FooBarLpRoot.call({
      method: "walletOf",
      params: {
        walletOwner: dexPairFooBarAddress,
      }
    }));

    const FooTokenVault = await locklift.factory.getContract('DexTokenVault');
    FooTokenVault.setAddress(await dexRoot.call({
      method: 'getExpectedTokenVaultAddress',
      params: { _tokenRoot: tokenFoo.address },
    }));

    const FooVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    FooVaultWallet.setAddress(await tokenFoo.call({
      method: "walletOf",
      params: {
        walletOwner: FooTokenVault.address,
      }
    }));

    const BarTokenVault = await locklift.factory.getContract('DexTokenVault');
    BarTokenVault.setAddress(await dexRoot.call({
      method: 'getExpectedTokenVaultAddress',
      params: { _tokenRoot: tokenBar.address },
    }));

    const BarVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    BarVaultWallet.setAddress(await tokenBar.call({
      method: "walletOf",
      params: {
        walletOwner: BarTokenVault.address,
      }
    }));

    const LpTokenVault = await locklift.factory.getContract('DexTokenVault');
    LpTokenVault.setAddress(await dexRoot.call({
      method: 'getExpectedTokenVaultAddress',
      params: { _tokenRoot: FooBarLpRoot.address },
    }));

    const FooBarLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
    FooBarLpVaultWallet.setAddress(await FooBarLpRoot.call({
      method: "walletOf",
      params: {
        walletOwner: LpTokenVault.address,
      }
    }));

    migration.store(FooBarLpRoot, pair.left + pair.right + 'LpRoot');
    migration.store(FooPairWallet, pair.left + pair.right + 'Pool_' + pair.left + 'Wallet');
    migration.store(BarPairWallet, pair.left + pair.right + 'Pool_' + pair.right + 'Wallet');
    migration.store(FooBarLpPairWallet, pair.left + pair.right + 'Pool_LpWallet');
    migration.store(FooTokenVault, pair.left + 'TokenVault');
    migration.store(BarTokenVault, pair.right + 'TokenVault');
    migration.store(FooVaultWallet, pair.left + 'VaultWallet');
    migration.store(BarVaultWallet, pair.right + 'VaultWallet');
    migration.store(LpTokenVault, pair.left + pair.right + 'LpVault');
    migration.store(FooBarLpVaultWallet, pair.left + pair.right + 'LpVaultWallet');
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
