import { Migration, displayTx } from '../utils/migration';
import {toNano} from "locklift";

const MANAGER =
  '0:30b833a0dbb28f79d461e6a1d5818b748c20eb9ab32286c03a7652a555d9a996';

async function main() {
  const migration = new Migration();
  const owner = await migration.loadAccount('Account1', '0');

  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  let tx = await dexRoot.methods.setManager({_newManager: MANAGER}).send({
    from: owner.address,
    amount: toNano(1)
  });

  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
