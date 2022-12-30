// @ts-ignore
const fs = require('fs');

async function exportDexPairs() {
  const OLD_DEX_PAIR_CODE_HASH = 'd7f137ee2123785ed7dd56fad374ab7c0e99343eb97e918aac1bbc6bd9bb827b';
  const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

  let dexPairsToUpdate = [];
  let continuation = undefined;
  let hasResults = true;
  while (hasResults) {
    let result: any = await locklift.provider.getAccountsByCodeHash({
          codeHash: OLD_DEX_PAIR_CODE_HASH,
          continuation,
          limit: 50
    });
    continuation = result.continuation;
    hasResults = result.accounts.length === 50;
    for (const dexPairAddress of result.accounts) {
      const DexPair = await locklift.factory.getDeployedContract('DexPair', dexPairAddress);
      // @ts-ignore
        const root = (await DexPair.methods.getRoot({ answerId: 0 }).call({})).dex_root.toString();
      if (root === DEX_ROOT_ADDRESS) {
        // @ts-ignore
          const roots = await DexPair.methods.getTokenRoots({ answerId: 0 }).call();
        console.log(`DexPair ${dexPairAddress}, left = ${roots.left}, right = ${roots.right}, lp = ${roots.lp}`);
        dexPairsToUpdate.push({
          dexPair: dexPairAddress,
          left: roots.left,
          right: roots.right,
          lp: roots.lp
        });
      }
    }
  }
  fs.writeFileSync('./dex_pairs.json', JSON.stringify(dexPairsToUpdate));

}

exportDexPairs()
    .then(() => process.exit(0))
    .catch(e => {
      console.log(e);
      process.exit(1);
    });

