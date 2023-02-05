import { Address, toNano } from 'locklift';
import { Migration } from '../../utils/migration';
import pairs from './dex_pairs.json';

const NewPoolType = 1;

const main = async () => {
  const migration = new Migration();

  const owner = await migration.loadAccount('Account1', '0');
  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  console.log(`Start force upgrade DexPairs. Count = ${pairs.length}`);

  for (const indx in pairs) {
    const pairData = pairs[indx];
    console.log(
      `${1 + +indx}/${pairs.length}: Upgrading DexPair(${
        pairData.dexPair
      }). left = ${pairData.left}, right = ${pairData.right}`,
    );
    console.log('');

    await dexRoot.methods
      .upgradePair({
        left_root: new Address(pairData.left),
        right_root: new Address(pairData.right),
        pool_type: NewPoolType,
        send_gas_to: owner.address,
      })
      .send({
        from: owner.address,
        amount: toNano(6),
      });

    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
