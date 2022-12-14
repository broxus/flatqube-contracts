import {toNano, WalletTypes} from "locklift";

const { Migration, displayTx } = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-rcn, --root_contract_name <root_contract_name>', 'DexRoot contract name')

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';

let tx;

async function main() {
    const migration = new Migration();
    const signer = await locklift.keystore.getSigner('0');
    const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

    const dexRoot = await locklift.factory.getDeployedContract( options.root_contract_name, migration.getAddress('DexRoot'));

    console.log(`Account address: ${account.address}`);
    console.log(`DexRoot address: ${dexRoot.address}`);

    console.log(`Accepting DEX ownership from by ${account.address}`);
    tx = await dexRoot.methods.acceptOwner().send({
        from: account.address,
        amount: toNano(1)
    });
    displayTx(tx);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
