const {Migration} = require(process.cwd()+'/scripts/utils');
const { Command } = require('commander');
const program = new Command();

import {toNano, WalletTypes} from "locklift";

const migration = new Migration();

async function main() {

  program
      .allowUnknownOption()
      .option('-n, --key_number <key_number>', 'count of accounts')
      .option('-b, --balance <balance>', 'count of accounts');

  program.parse(process.argv);

  const options = program.opts();

  const key_number = +(options.key_number || '0');
  const balance = +(options.balance || '10');

  const signer = await locklift.keystore.getSigner(key_number.toString());
  const account = (await locklift.factory.accounts.addNewAccount({
    type: WalletTypes.WalletV3, // or WalletTypes.HighLoadWallet,
    //Value which will send to the new account from a giver
    value: toNano(balance),
    //owner publicKey
    publicKey: signer!.publicKey,
  })).account;

  const name = `Account${key_number+1}`;
  migration.store(account, name);
  console.log(`${name}: ${account.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
