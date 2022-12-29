const {Migration, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
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
    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;
    const [keyPair] = await locklift.keys.getKeyPairs();

    const dexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');

    if (options.project_id !== undefined && options.project_address !== undefined) {
        console.log(`Set referral program params:\n -project_id: ${options.project_id}\n-project_address: ${options.project_address}`);
        const tx = await account.runTarget({
            contract: dexVault,
            method: 'updateReferralProgramParams',
            params: {
                project_id: options.project_id,
                project_address: options.project_address
            },
            value: locklift.utils.convertCrystal(1, 'nano'),
            keyPair
        });
        displayTx(tx);
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
