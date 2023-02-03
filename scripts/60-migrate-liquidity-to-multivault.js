const {Migration, afterRun, displayTx} = require(process.cwd()+'/scripts/utils');

async function processTokenWallets() {
  console.log('60-migrate-liquidity-to-multivault.js');

  const migration = new Migration();
  const keyPairs = await locklift.keys.getKeyPairs();
  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  account.afterRun = afterRun;

  const DexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');

  console.log(`DexVault.migrateLiquidity`);
  let tx = await account.runTarget({
    contract: DexVault,
    method: 'migrateLiquidity',
    params: {},
    keyPair: keyPairs[0],
    value: locklift.utils.convertCrystal(200, 'nano')
  });
  displayTx(tx);

}

processTokenWallets()
    .then(() => process.exit(0))
    .catch(e => {
      console.log(e);
      process.exit(1);
    });

