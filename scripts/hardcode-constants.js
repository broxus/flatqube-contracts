const fs = require('fs');
const {Migration, afterRun} = require(process.cwd()+'/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});


async function main() {
    console.log(`hardcode-constants.js`);

    const migration = new Migration();

    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;

    const content = '' +
        `pragma ever-solidity ^0.62.0;
abstract contract Constants {
    uint256 constant PROJECT_ID = 2222;
    address constant PROJECT_ADDRESS = address.makeAddrStd(0, 0x${account.address.substr(2).toLowerCase()});
}`

    console.log('Replace Constants.sol with');
    console.log(content);
    fs.writeFileSync(process.cwd() + '/contracts/abstract/Constants.sol', content);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
