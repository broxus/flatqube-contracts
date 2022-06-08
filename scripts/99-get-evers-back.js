const {Migration} = require(process.cwd() + '/scripts/migration')
const { Command } = require('commander');

const migration = new Migration();
const program = new Command();

program
    .allowUnknownOption()
    .option('-n, --key_number <key_number>', 'count of accounts');

program.parse(process.argv);

const options = program.opts();

async function main() {

    const key_number = +(options.key_number || '0');

    const [keyPair] = await locklift.keys.getKeyPairs();
    const account = await locklift.factory.getAccount("Wallet");
    migration.load(account, `Account${key_number+1}`)

    const giverAddress = locklift.giver.giver.address;

    await account.run({
        method: 'sendTransaction',
        params: {
            dest: giverAddress,
            value: 0,
            bounce: false,
            flags: 128,
            payload: ''
        },
        keyPair
    });
}


main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
