const { Migration, afterRun, displayTx } = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-rcn, --root_contract_name <root_contract_name>', 'DexRoot contract name')
    .option('-pcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

let tx;

async function main() {
    const migration = new Migration();
    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;

    const [keyPair] = await locklift.keys.getKeyPairs();

    const dexRoot = migration.load(await locklift.factory.getContract(options.root_contract_name), 'DexRoot');

    console.log(`Account address: ${account.address}`);
    console.log(`DexRoot address: ${dexRoot.address}`);

    console.log(`Accepting DEX ownership from by ${account.address}`);
    tx = await account.runTarget({
        contract: dexRoot,
        method: 'acceptOwner',
        value: locklift.utils.convertCrystal(1, 'nano'),
        keyPair: keyPair
    });
    displayTx(tx);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });