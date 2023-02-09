import { Address } from 'locklift';
import { BigNumber } from 'bignumber.js';
import pairs from '../../../dex_pairs.json';

BigNumber.config({ EXPONENTIAL_AT: 257 });

async function main() {
  console.log(`Total pair count = ${pairs.length}`);

  let activeCount = 0;

  for (const indx in pairs) {
    const pairData = pairs[indx];

    const DexPair = await locklift.factory.getDeployedContract(
      'DexPair',
      new Address(pairData.dexPair),
    );

    const active = (await DexPair.methods.isActive({ answerId: 0 }).call())
      .value0;

    if (active) {
      activeCount++;
      console.log('Pair active: ' + pairData.dexPair);
    }
  }
  console.log(`Active pairs count = ${activeCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
