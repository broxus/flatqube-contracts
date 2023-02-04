const {Migration, afterRun, displayTx, EMPTY_TVM_CELL} = require(process.cwd() + '/scripts/utils')
const { Command } = require('commander');
const program = new Command();

const MANAGER = '0:a8f13ead2b40cad79f9aa735c53313480303261a611e13a7140bd7aab446b450';

async function main() {
  const migration = new Migration();
  const keyPairs = await locklift.keys.getKeyPairs();
  const owner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');

  const dexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');

  let tx = await owner.runTarget({
    contract: dexVault,
    method: 'setManager',
    params: {_newManager: MANAGER},
    value: locklift.utils.convertCrystal(1, 'nano'),
    keyPair: keyPairs[0]
  });

  displayTx(tx);

  const ownerContract = migration.load(await locklift.factory.getContract('Wallet'), 'Account1');

  tx = await ownerContract.run({
    method: 'sendTransaction',
    params: {
      dest: MANAGER,
      value: locklift.utils.convertCrystal(100, 'nano'),
      bounce: false,
      flags: 1,
      payload: EMPTY_TVM_CELL
    },
    keyPair: keyPairs[0]
  });

  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
