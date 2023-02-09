const {Migration, afterRun, displayTx} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();
const migration = new Migration();

program
    .allowUnknownOption()
    .option('-old, --old_contract <old_contract>', 'Old contract name')
    .option('-new, --new_contract <new_contract>', 'New contract name');

program.parse(process.argv);

const options = program.opts();
options.old_contract = options.old_contract || 'DexRootPrev';
options.new_contract = options.new_contract || 'DexRoot';

async function main() {
  console.log(``);
  console.log(`##############################################################################################`);
  console.log(`update-dexRoot.js`);
  console.log(`OPTIONS: `, options);
  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  account.afterRun = afterRun;
  const [keyPair] = await locklift.keys.getKeyPairs();

  const DexVaultLpTokenPendingV2 = await locklift.factory.getContract('DexVaultLpTokenPendingV2');
  const DexTokenVault = await locklift.factory.getContract('DexTokenVault');
  const dexRoot = migration.load(await locklift.factory.getContract(options.old_contract), 'DexRoot');
  const NewDexRoot = await locklift.factory.getContract(options.new_contract);

  console.log(`Upgrading DexRoot contract: ${dexRoot.address}`);
  await account.runTarget({
    contract: dexRoot,
    method: 'upgrade',
    params: {
      code: NewDexRoot.code
    },
    value: locklift.utils.convertCrystal(11, 'nano'),
    keyPair
  });

  NewDexRoot.setAddress(dexRoot.address);

  console.log('DexRoot: installing vault code...');
  let tx = await account.runTarget({
    contract: NewDexRoot,
    method: 'installOrUpdateTokenVaultCode',
    params: {
      _newCode: DexTokenVault.code,
      _remainingGasTo: account.address,
    },
    keyPair,
  });
  displayTx(tx);

  console.log('DexRoot: installing lp pending code...');
  tx = await account.runTarget({
    contract: NewDexRoot,
    method: 'installOrUpdateLpTokenPendingCode',
    params: {
      _newCode: DexVaultLpTokenPendingV2.code,
      _remainingGasTo: account.address,
    },
    keyPair,
  });
  displayTx(tx);

  const TokenFactory = migration.load(await locklift.factory.getContract('TokenFactory'), 'TokenFactory').address;
  console.log('DexRoot: set token factory...');
  tx = await account.runTarget({
    contract: NewDexRoot,
    method: 'setTokenFactory',
    params: {
      _newTokenFactory: TokenFactory,
      _remainingGasTo: account.address,
    },
    keyPair,
  });
  displayTx(tx);

}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
