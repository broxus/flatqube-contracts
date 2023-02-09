const {Migration, afterRun, displayTx, TOKEN_CONTRACTS_PATH} = require(process.cwd()+'/scripts/utils');

async function processTokenWallets() {
  console.log('60-migrate-liquidity-to-multivault.js');
  const migration = new Migration();

  const keyPairs = await locklift.keys.getKeyPairs();
  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  account.afterRun = afterRun;

  const DexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
  const DexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');

  // load expected addreses into migration

  const tokenAddresses = migration.getAddressesByName('TokenRootUpgradeable');
  console.log(tokenAddresses);

  console.log('Load expected addresses to migration');
  for (const tokenAddress of tokenAddresses) {
    const TokenRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH)
    TokenRoot.setAddress(tokenAddress);
    const symbol = await TokenRoot.call({ method: "symbol", params: {}});
    const owner = await TokenRoot.call({ method: "rootOwner", params: {}});

    if (owner === account.address) {
      console.log(`Load ${symbol}`);

      const TokenVault = await locklift.factory.getContract('DexTokenVault');
      TokenVault.setAddress(await DexRoot.call({
        method: 'getExpectedTokenVaultAddress',
        params: { _tokenRoot: TokenRoot.address },
      }));

      const VaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
      VaultWallet.setAddress(await TokenRoot.call({
        method: "walletOf",
        params: {
          walletOwner: TokenVault.address,
        }
      }));

      migration.store(TokenVault, symbol + 'TokenVault');
      migration.store(VaultWallet, symbol + 'VaultWallet');
    }
  }

  await migration.balancesCheckpoint();

  console.log(`DexVault.migrateLiquidity`);
  let tx = await account.runTarget({
    contract: DexVault,
    method: 'migrateLiquidity',
    params: {},
    keyPair: keyPairs[0],
    value: locklift.utils.convertCrystal(105, 'nano')
  });
  displayTx(tx);

  await migration.logGas();

}

processTokenWallets()
    .then(() => process.exit(0))
    .catch(e => {
      console.log(e);
      process.exit(1);
    });

