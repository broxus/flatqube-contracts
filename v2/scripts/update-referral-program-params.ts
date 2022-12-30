import {toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd() + '/scripts/utils')
const { Command } = require('commander');
const program = new Command();
const migration = new Migration();

program
    .allowUnknownOption()
    .option('-id, --project_id <project_id>', 'Project Id')
    .option('-addr, --project_address <project_address>', 'Project address');

program.parse(process.argv);

const options = program.opts();

async function main() {
    const account = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: migration.getAddress('Account1')
    });

    const dexVault = await locklift.factory.getDeployedContract('DexVault', migration.getAddress('DexVault'));

    if (options.project_id !== undefined && options.project_address !== undefined) {
        console.log(`Set referral program params:\n -project_id: ${options.project_id}\n-project_address: ${options.project_address}`);
        const tx = dexVault.methods.updateReferralProgramParams(
            {
                project_id: options.project_id,
                project_address: options.project_address
            }
        ).send({
            from: account.address,
            amount: toNano(1)
        })
        displayTx(tx);
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
