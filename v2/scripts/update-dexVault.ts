import {toNano, WalletTypes} from "locklift";

const {Migration} = require(process.cwd() + '/scripts/utils')
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
  const account = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: migration.getAddress('Account1')
  });

  const dexVaultPrev = await locklift.factory.getDeployedContract(options.old_contract, migration.getAddress('DexVault'));
  const DexVault = await locklift.factory.getContractArtifacts(options.new_contract);

  console.log(`Upgrading DexVault contract: ${dexVaultPrev.address}`);
  // @ts-ignore
  await locklift.transactions.waitFinalized(dexVaultPrev.methods.upgrade(
      { code: DexVault.code }
  ).send({
    from: account.address,
    amount: toNano(6)
  }));
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
