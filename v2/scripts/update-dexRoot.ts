import { Address, toNano } from 'locklift';

import { displayTx, Migration } from '../utils/migration';
import { Command } from 'commander';
const program = new Command();
const migration = new Migration();

const isValidTonAddress = (address: any) =>
  /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

const DEFAULT_TOKEN_FACTORY_ADDRESS = new Address(
  '0:d291ab784f3ce6958fad0e473bcd61891b303cfe7a96e2c7074f20eadd500f44',
);

program
  .allowUnknownOption()
  .option('-old, --old_contract <old_contract>', 'Old contract name')
  .option('-new, --new_contract <new_contract>', 'New contract name')
  .option(
    '-tf, --token_factory_addr <token_factory_addr>',
    'TokenFactory address',
  );

program.parse(process.argv);

const options = program.opts();
options.old_contract = options.old_contract || 'DexRootPrev';
options.new_contract = options.new_contract || 'DexRoot';
options.token_factory_addr =
  options.token_factory_addr && isValidTonAddress(options.token_factory_addr)
    ? options.token_factory_addr
    : undefined;

async function main() {
  console.log(``);
  console.log(
    `##############################################################################################`,
  );
  console.log(`update-dexRoot.js`);
  console.log(`OPTIONS: `, options);
  const account = await migration.loadAccount('Account1', '0');

  const LpTokenPending = await locklift.factory.getContractArtifacts(
    'LpTokenPending',
  );
  const DexTokenVault = await locklift.factory.getContractArtifacts(
    'DexTokenVault',
  );
  const dexRoot = await migration.loadContract('DexRoot', 'DexRoot');
  const NewDexRoot = await locklift.factory.getContractArtifacts(
    options.new_contract,
  );

  let tokenFactory;

  if (migration.exists('TokenFactory')) {
    tokenFactory = migration.loadContract('TokenFactory', 'TokenFactory');
  } else {
    tokenFactory = await locklift.factory.getDeployedContract<'DexRoot'>(
        options.old_contract,
        DEFAULT_TOKEN_FACTORY_ADDRESS,
    );
  }

  console.log(`Upgrading DexRoot contract: ${dexRoot.address}`);

  await locklift.transactions.waitFinalized(
    dexRoot.methods.upgrade({ code: NewDexRoot.code }).send({
      from: account.address,
      amount: toNano(11),
    }),
  );

  const newDexRoot = await locklift.factory.getDeployedContract<'DexRoot'>(
    options.new_contract,
    dexRoot.address,
  );

  console.log('DexRoot: installing vault code...');
  let tx = await newDexRoot.methods
    .installOrUpdateTokenVaultCode({
      _newCode: DexTokenVault.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log('DexRoot: installing lp pending code...');
  tx = await newDexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: LpTokenPending.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log('DexRoot: set token factory...');
  tx = await newDexRoot.methods
    .setTokenFactory({
      _newTokenFactory: tokenFactory.address,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
