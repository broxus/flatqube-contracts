const {Migration, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();

async function main() {
  const rootOwner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  rootOwner.afterRun = afterRun;
  const [keyPair] = await locklift.keys.getKeyPairs();
  const dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
  const NewDexAccount = await locklift.factory.getContract('NewDexAccount');

  console.log(`Installing new DexAccount contract in DexRoot: ${dexRoot.address}`);
  await rootOwner.runTarget({
    contract: dexRoot,
    method: 'installOrUpdateAccountCode',
    params: {code: NewDexAccount.code},
    value: locklift.utils.convertCrystal(1, 'nano'),
    keyPair
  });

  const accounts_to_force_update = [ migration.load(await locklift.factory.getAccount('Wallet'), 'Account2') ];

  await Promise.all(accounts_to_force_update.map(async (account) => {
    console.log(`Upgrading DexAccount contract: owner=${account.address}`);

    const tx = await rootOwner.runTarget({
      contract: dexRoot,
      method: 'forceUpgradeAccount',
      params: {
        account_owner: account.address,
        send_gas_to: account.address
      },
      value: locklift.utils.convertCrystal(6, 'nano'),
      keyPair
    });
    displayTx(tx);
  }));
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
