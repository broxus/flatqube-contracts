import { Migration } from '../utils/migration';
import { Address } from 'locklift';

async function main() {
  const migration = new Migration();

  migration.store(
    {
      address: new Address(
        '0:2c3a2ff6443af741ce653ae4ef2c85c2d52a9df84944bbe14d702c3131da3f14',
      ),
    },
    'WEVERRoot',
  );

  migration.store(
    {
      address: new Address(
        '0:2c3a2ff6443af741ce653ae4ef2c85c2d52a9df84944bbe14d702c3131da3f14',
      ),
    },
    'WEVERVault',
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
