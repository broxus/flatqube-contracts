import { Address, toNano, WalletTypes } from 'locklift';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Migration, displayTx } = require(process.cwd() + '/scripts/utils');
import { Command } from 'commander';
const program = new Command();
const migration = new Migration();

program
  .allowUnknownOption()
  .option('-id, --project_id <project_id>', 'Project Id')
  .option('-proj, --project_address <project_address>', 'Project address')
  .option(
    '-ref_sys, --ref_system_address <ref_system_address>',
    'Referral system address',
  );

program.parse(process.argv);

const options = program.opts();

const DEX_VAULT_ADDRESS =
  '0:6fa537fa97adf43db0206b5bec98eb43474a9836c016a190ac8b792feb852230';

async function main() {
  const account = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: migration.getAddress('Account1'),
  });

  const dexVault = await locklift.factory.getDeployedContract(
    'DexVault',
    new Address(DEX_VAULT_ADDRESS),
  );

  if (
    options.project_id !== undefined &&
    options.project_address !== undefined &&
    options.ref_system_address !== undefined
  ) {
    console.log(
      `Set referral program params:\n -project_id: ${options.project_id}\n -project_address: ${options.project_address}\n -ref_system_address: ${options.ref_system_address}`,
    );
    const tx = await dexVault.methods
      .setReferralProgramParams({
        params: {
          projectId: options.project_id,
          projectAddress: options.project_address,
          systemAddress: options.ref_system_address,
        },
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    displayTx(tx);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
