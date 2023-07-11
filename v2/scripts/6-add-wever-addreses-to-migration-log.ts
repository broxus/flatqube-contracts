import { Migration } from '../utils/migration';
import { Address } from 'locklift';

async function main() {
  const migration = new Migration();

  migration.store(
    {
      address: new Address(
        '0:a49cd4e158a9a15555e624759e2e4e766d22600b7800d891e46f9291f044a93d',
      ),
    },
    'WEVERRoot',
  );

  migration.store(
    {
      address: new Address(
        '0:557957cba74ab1dc544b4081be81f1208ad73997d74ab3b72d95864a41b779a4',
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
