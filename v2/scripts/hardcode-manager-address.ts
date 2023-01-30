import {WalletTypes} from "locklift";

const fs = require('fs');
const {Migration, afterRun} = require(process.cwd()+'/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});


async function main() {
    console.log(`hardcode-manager-address.js`);

    const signer = await locklift.keystore.getSigner('0');
    const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

    const content = '' +
        `pragma ton-solidity >= 0.62.0;
abstract contract ManagerAddress {
    address constant MANAGER_ADDRESS = address.makeAddrStd(0, 0x${account.address.toString().substr(2).toLowerCase()});
}`

    console.log('Replace ManagerAddress.tsol with');
    console.log(content);
    fs.writeFileSync(process.cwd() + '/contracts/abstract/ManagerAddress.tsol', content);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
