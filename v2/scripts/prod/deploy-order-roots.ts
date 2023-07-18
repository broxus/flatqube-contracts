import { Address } from 'locklift';
import manifest from '../../../manifest.json';
import { Migration } from '../../utils/migration';

const migration = new Migration();

async function main() {
  const factoryOrder = migration.loadContract('OrderFactory', 'OrderFactory');

  const account = await migration.loadAccount('Account1', '0');

  for (const elTokens of manifest.tokens) {
    await factoryOrder.methods
      .createOrderRoot({ token: new Address(elTokens.address), callbackId: 0 })
      .send({
        amount: locklift.utils.toNano(6),
        from: account.address,
      });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
