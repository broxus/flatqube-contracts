import {toNano, WalletTypes} from "locklift";

const {Migration} = require(process.cwd()+'/scripts/utils')
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
  const account = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: migration.getAddress('Account1')
  });

  const dexRoot = await locklift.factory.getDeployedContract(options.old_contract, migration.getAddress('DexRoot'));
  const NewDexRoot = await locklift.factory.getContractArtifacts(options.new_contract);

  console.log(`Upgrading DexRoot contract: ${dexRoot.address}`);

  await locklift.transactions.waitFinalized(
     // @ts-ignore
      dexRoot.methods.upgrade(
      {code: NewDexRoot.code}
    ).send({
      from: account.address,
      amount: toNano(11)
    }));
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
