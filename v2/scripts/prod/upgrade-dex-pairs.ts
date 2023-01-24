import {toNano} from "locklift";
const fs = require('fs');
const {WalletTypes, Address} = require("locklift");
const {Migration} = require(process.cwd()+'/scripts/utils')

const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';
const NewPoolType = 1;

const data = fs.readFileSync('./dex_pairs.json', 'utf8');
let dexPairs = data ? JSON.parse(data) : [];

async function main() {
    const migration = new Migration();
    const dexOwner = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: migration.getAddress('Account1')
    });

    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', new Address(DEX_ROOT_ADDRESS));

    console.log(`Start force upgrade DexPairs. Count = ${dexPairs.length}`);

    for(let indx in dexPairs) {
        const pairData = dexPairs[indx];
        console.log(`${1 + (+indx)}/${dexPairs.length}: Upgrading DexPair(${pairData.dexPair}). left = ${pairData.left}, right = ${pairData.right}`);
        console.log('');

        dexRoot.methods.upgradePair(
            {
                left_root: pairData.left,
                right_root: pairData.right,
                pool_type: NewPoolType,
                send_gas_to: dexOwner.address
            }
        ).send({
            from: dexOwner.address,
            amount: toNano(6)
        }).catch(e => { /* ignored */ });

        await new Promise(resolve => setTimeout(resolve, 1100));
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });

