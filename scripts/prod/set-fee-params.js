const {afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const {Migration} = require(process.cwd()+'/scripts/utils')

const fs = require('fs');

let dexPairs;

const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

const data = fs.readFileSync('./dex_fees.json', 'utf8');
if (data) dexPairs = JSON.parse(data);

async function main() {
    const migration = new Migration();
    const dexOwner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    const keyPairs = await locklift.keys.getKeyPairs();
    const DEX_OWNER_KEYS = keyPairs[0];

    const dexRoot = await locklift.factory.getContract('DexRoot');
    dexRoot.setAddress(DEX_ROOT_ADDRESS);

    console.log(`Start upgrade fee params. Count = ${dexPairs.length}`);

    for (let indx in dexPairs) {
        const pairData = dexPairs[indx];
        console.log(`${1 + (+indx)}/${dexPairs.length}: Update fee params for ${pairData.title}`);
        const tx = await dexOwner.runTarget({
            contract: dexRoot,
            method: 'setPairFeeParams',
            params: {
                _roots: pairData.roots,
                _params: pairData.fee,
                _remainingGasTo: dexOwner.address
            },
            value: locklift.utils.convertCrystal(5, 'nano'),
            keyPair: DEX_OWNER_KEYS
        });
        displayTx(tx);
        console.log(``);
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });

