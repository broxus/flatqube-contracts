import { Migration } from '../utils/migration';
import { Address } from 'locklift';

async function main() {
  const migration = new Migration();

  migration.store(
    {
      address: new Address(
        '0:5fc1c3c6ed83f5752f5029ac2b2bb64e77bef307c967f997895eaf516331ee11',
      ),
    },
    'WEVERRoot',
  );

  migration.store(
    {
      address: new Address(
        '0:5fc1c3c6ed83f5752f5029ac2b2bb64e77bef307c967f997895eaf516331ee11',
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
