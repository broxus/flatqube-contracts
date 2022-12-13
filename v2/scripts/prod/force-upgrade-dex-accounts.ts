import {Address, toNano, WalletTypes} from "locklift";
const {displayTx} = require(process.cwd() + '/scripts/utils')
const fs = require('fs');

async function main() {

  const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

  const data = fs.readFileSync('./dex_accounts.json', 'utf8');
  let dexAccounts = data ? JSON.parse(data) : [];

  const signer = await locklift.keystore.getSigner('0');
  const dexOwner = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

  const dexRoot = await locklift.factory.getDeployedContract('DexRoot', new Address(DEX_ROOT_ADDRESS));

  console.log(`Start force upgrade DexAccounts. Count = ${dexAccounts.length}`);

  for(let indx in dexAccounts) {
      const accountData = dexAccounts[indx];
      console.log(`${1 + (+indx)}/${dexAccounts.length}: Upgrading DexAccount(${accountData.dexAccount}). owner = ${accountData.owner}`);

      const tx = await locklift.transactions.waitFinalized(
          // @ts-ignore
          dexRoot.methods.forceUpgradeAccount(
              {
                  account_owner: accountData.owner,
                  send_gas_to: dexOwner.address
              }
          ).send({
              from: dexOwner.address,
              amount: toNano(6)
          }));

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

