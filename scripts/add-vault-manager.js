const {
  Migration,
  displayTx,
  EMPTY_TVM_CELL,
} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();

const MANAGER =
  '0:2746d46337aa25d790c97f1aefb01a5de48cc1315b41a4f32753146a1e1aeb7d';

async function main() {
  const migration = new Migration();
  const keyPairs = await locklift.keys.getKeyPairs();
  const owner = migration.load(
    await locklift.factory.getAccount('Wallet'),
    'Account1',
  );

  const dexVault = migration.load(
    await locklift.factory.getContract('DexVault'),
    'DexVault',
  );
  const dexRoot = migration.load(
    await locklift.factory.getContract('DexRoot'),
    'DexRoot',
  );

  let tx = await owner.runTarget({
    contract: dexVault,
    method: 'setManager',
    params: { _newManager: MANAGER },
    value: locklift.utils.convertCrystal(1, 'nano'),
    keyPair: keyPairs[0],
  });

  displayTx(tx);

  tx = await owner.runTarget({
    contract: dexRoot,
    method: 'setManager',
    params: { _newManager: MANAGER },
    value: locklift.utils.convertCrystal(1, 'nano'),
    keyPair: keyPairs[0],
  });

  displayTx(tx);

  const ownerContract = migration.load(
    await locklift.factory.getContract('Wallet'),
    'Account1',
  );

  tx = await ownerContract.run({
    method: 'sendTransaction',
    params: {
      dest: MANAGER,
      value: locklift.utils.convertCrystal(1000, 'nano'),
      bounce: false,
      flags: 1,
      payload: EMPTY_TVM_CELL,
    },
    keyPair: keyPairs[0],
  });

  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
