const {Migration, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const { Command } = require('commander');
const program = new Command();
const migration = new Migration();

program
    .allowUnknownOption()
    .option('-old, --old_contract <old_contract>', 'Old contract name')
    .option('-new, --new_contract <new_contract>', 'New contract name');

program.parse(process.argv);

const options = program.opts();
options.old_contract = options.old_contract || 'DexVaultPrev';
options.new_contract = options.new_contract || 'DexVault';

async function main() {
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContract('DexVaultLpTokenPendingV2');

  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  account.afterRun = afterRun;
  const [keyPair] = await locklift.keys.getKeyPairs();

  const dexVaultPrev = migration.load(await locklift.factory.getContract(options.old_contract), 'DexVault');
  const DexVault = await locklift.factory.getContract(options.new_contract);

  console.log(`Upgrading DexVault contract: ${dexVaultPrev.address}`);
  await account.runTarget({
    contract: dexVaultPrev,
    method: 'upgrade',
    params: {
      code: DexVault.code
    },
    value: locklift.utils.convertCrystal(6, 'nano'),
    keyPair
  });
  DexVault.setAddress(dexVaultPrev.address);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
