// @ts-ignore
const fs = require('fs');

async function main() {
  const OLD_DEX_ACCOUNT_CODE_HASH = 'ed649f47322294142e5cc1ae3387cc46e208eb480b5b7e8746b306e83a66cb6b';
  const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';


  const dexAccountsToUpdate = [];
  let continuation = undefined;
  let hasResults = true;
  while (hasResults) {
    // @ts-ignore
    let result = await locklift.provider.getAccountsByCodeHash({
      codeHash: OLD_DEX_ACCOUNT_CODE_HASH,
      continuation,
      limit: 50
    });
    continuation = result.continuation;
    hasResults = result.accounts.length === 50;
    for (const dexAccountAddress of result.accounts) {
      const DexAccount = await locklift.factory.getDeployedContract('DexAccount', dexAccountAddress);
      // @ts-ignore
      const root = (await DexAccount.methods.getRoot({ answerId: 0 }).call({})).value0.toString();
      if (root === DEX_ROOT_ADDRESS) {
        // @ts-ignore
        const owner = (await DexAccount.methods.getOwner({ answerId: 0 }).call({})).value0.toString();
        console.log(`DexAccount ${dexAccountAddress.toString()}, owner = ${owner}`);
        dexAccountsToUpdate.push({
          dexAccount: dexAccountAddress.toString(),
          owner: owner
        });
      }
    }
  }
  fs.writeFileSync('./dex_accounts.json', JSON.stringify(dexAccountsToUpdate));

}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });

