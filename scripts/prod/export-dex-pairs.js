const fs = require('fs');

const OLD_DEX_PAIR_CODE_HASH = '11e918a3bf13f14b355bf675f7d6ab6c0ab6d60ebd6c15f888372c82dd0f6397';
const DEX_ROOT_ADDRESS = '0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008';

async function main() {
  const dexOwnersToUpdate = [];
  const DexPair = await locklift.factory.getContract('DexPair');

  let lastAddress = locklift.utils.zeroAddress;
  let hasResults = true;
  while (hasResults) {
    let result = await locklift.ton.client.net.query_collection({
      collection: 'accounts',
      filter: {
        code_hash: {eq: OLD_DEX_PAIR_CODE_HASH},
        id: {gt: lastAddress}
      },
      order: [{path: 'id', direction: 'ASC'}],
      limit: 50,
      result: 'id'
    });
    result = result.result;
    hasResults = result.length === 50;
    if (hasResults) {
      lastAddress = result[49].id;
    }
    for (const dexPair of result) {
      DexPair.setAddress(dexPair.id);
      if ((await DexPair.call({method: 'getRoot'})) === DEX_ROOT_ADDRESS) {
        const roots = await DexPair.call({method: 'getTokenRoots'})
        console.log(`DexPair ${dexPair.id}, left = ${roots.left}, right = ${roots.right}, lp = ${roots.lp}`);
        dexOwnersToUpdate.push({
          dexPair: dexPair.id,
          left: roots.left,
          right: roots.right,
          lp: roots.lp
        });
      }
    }
  }
  fs.writeFileSync('./dex_pairs.json', JSON.stringify(dexOwnersToUpdate));

}

main()
    .then(() => process.exit(0))
    .catch(e => {
      console.log(e);
      process.exit(1);
    });

