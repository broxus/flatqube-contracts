const {getRandomNonce, Migration, afterRun} = require(process.cwd()+'/scripts/utils')

async function main() {
  const migration = new Migration();

  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  if (locklift.tracing) {
    locklift.tracing.allowCodesForAddress(account.address, {compute: [100]});
  }
  account.afterRun = afterRun;

  const [keyPair] = await locklift.keys.getKeyPairs();

  const DexGasValues = await locklift.factory.getContract('DexGasValues');
  const gasValues = await locklift.giver.deployContract({
    contract: DexGasValues,
    constructorParams: {
      owner_: account.address
    },
    initParams: {
      _nonce: getRandomNonce()
    },
    keyPair,
  }, locklift.utils.convertCrystal(2, 'nano'));
  migration.store(gasValues, 'DexGasValues');

  console.log(`GasValues: ${gasValues.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
