const {Migration, calcValue} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-o, --owner_n <owner_n>', 'owner number')
    .option('-cn, --contract_name <contract_name>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();

options.owner_n = options.owner_n ? +options.owner_n : 2;
options.contract_name = options.contract_name || 'DexAccount';

async function main() {
  const migration = new Migration();
  const keyPairs = await locklift.keys.getKeyPairs();

  const accountN = migration.load(await locklift.factory.getAccount('Wallet'), 'Account' + options.owner_n);
  if (locklift.tracing) {
    locklift.tracing.allowCodesForAddress(accountN.address, {compute: [100]});
  }
  const dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
  const gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');
  const gas = await gasValues.call({
    method: 'getDeployAccountGas',
    params: {}
  });

  await accountN.runTarget({
    contract: dexRoot,
    method: 'deployAccount',
    params: {
      'account_owner': accountN.address,
      'send_gas_to': accountN.address
    },
    keyPair: keyPairs[options.owner_n - 1],
    value: options.contract_name === 'DexAccountPrev' ? locklift.utils.convertCrystal(4, 'nano') : calcValue(gas)
  });
  const dexAccountNAddress = await dexRoot.call({
    method: 'getExpectedAccountAddress',
    params: {'account_owner': accountN.address}
  });
  console.log(`DexAccount${options.owner_n}: ${dexAccountNAddress}`);
  const dexAccountN = await locklift.factory.getContract(options.contract_name);
  dexAccountN.address = dexAccountNAddress;
  migration.store(dexAccountN, 'DexAccount' + options.owner_n);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
