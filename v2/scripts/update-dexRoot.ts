import {toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd()+'/scripts/utils')
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

  const DexVaultLpTokenPendingV2 = await locklift.factory.getContractArtifacts('DexVaultLpTokenPendingV2');
  const DexTokenVault = await locklift.factory.getContractArtifacts('DexTokenVault');
  const dexRoot = await locklift.factory.getDeployedContract(options.old_contract, migration.getAddress('DexRoot'));
  const NewDexRoot = await locklift.factory.getContractArtifacts(options.new_contract);

  console.log(`Upgrading DexRoot contract: ${dexRoot.address}`);

  await locklift.transactions.waitFinalized(
      dexRoot.methods.upgrade(
      {code: NewDexRoot.code}
    ).send({
      from: account.address,
      amount: toNano(11)
    }));

  const newDexRoot = await locklift.factory.getDeployedContract(options.new_contract, dexRoot.address);

  console.log('DexRoot: installing vault code...');
  let tx = await newDexRoot.methods.installOrUpdateVaultCode({
    _newCode: DexTokenVault.code,
    _remainingGasTo: account.address
  }).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log('DexRoot: installing lp pending code...');
  tx = await newDexRoot.methods.installOrUpdateLpTokenPendingCode({
    _newCode: DexVaultLpTokenPendingV2.code,
    _remainingGasTo: account.address,
  }).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log('DexRoot: set token factory...');
  tx = await newDexRoot.methods.setTokenFactory({
    _newTokenFactory: migration.getAddress('TokenFactory'),
    _remainingGasTo: account.address,
  }).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
