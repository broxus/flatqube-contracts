import {toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-rcn, --root_contract_name <root_contract_name>', 'DexRoot contract name')
    .option('-pcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')
    .option('-o, --new_owner <new_owner>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

let tx;

async function main() {
    if (options.new_owner) {
        const migration = new Migration();
        const signer = await locklift.keystore.getSigner('0');
        const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

        const dexRoot = await locklift.factory.getDeployedContract( options.root_contract_name, migration.getAddress('DexRoot'));

        console.log(`Account address: ${account.address}`);
        console.log(`DexRoot address: ${dexRoot.address}`);

        console.log(`Transferring DEX ownership from ${account.address} to ${options.new_owner}`);
        // @ts-ignore
        tx = await dexRoot.methods.transferOwner(
            {
                new_owner: options.new_owner
            }
        ).send({
            from: account.address,
            amount: toNano(1)
        });
        displayTx(tx);
    } else {
        console.log('REQUIRED: --new_owner <new_owner>');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
