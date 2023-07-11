import { Migration } from '../utils/migration';
import { Address, toNano } from 'locklift';

async function main() {
  const MANAGER = new Address(
    '0:33478651d9c7b44c1b45c2dfe85edf7a5d24692f5222f0a25c176b1abfd95e51',
  );
  const migration = new Migration();
  const owner = await migration.loadAccount('Account1', '0');
  // migration.store(
  //   {
  //     address: MANAGER,
  //   },
  //   'Account2',
  // );

  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');
  const dexVault = migration.loadContract('DexVault', 'DexVault');
  const foo = migration.loadContract('TokenRootUpgradeable', 'FooRoot');
  const bar = migration.loadContract('TokenRootUpgradeable', 'BarRoot');
  const qwe = migration.loadContract('TokenRootUpgradeable', 'QweRoot');
  const tst = migration.loadContract('TokenRootUpgradeable', 'TstRoot');

  console.log(`DexRoot.setManager(${MANAGER})`);
  await dexRoot.methods.setManager({ _newManager: MANAGER }).send({
    from: owner.address,
    amount: toNano(1),
  });

  console.log(`DexVault.setManager(${MANAGER})`);
  await dexVault.methods.setManager({ _newManager: MANAGER }).send({
    from: owner.address,
    amount: toNano(1),
  });

  console.log(`DexVault.setReferralProgramParams`);
  await dexVault.methods
    .setReferralProgramParams({
      params: {
        projectId: '0',
        systemAddress: new Address(
          '0:1cf8f1dee31e3c74888d1adac9a013ed4bfe1ddf5b431e0c5b1d4e1dd5192217',
        ),
        projectAddress: new Address(
          '0:a642ad3ab35551f8a45b12984611bf90b6a884a50b2dd8d9e0fc306b278e1cc6',
        ),
      },
    })
    .send({
      from: owner.address,
      amount: toNano(1),
    });

  console.log(`Set fee params`);
  await dexRoot.methods
    .setPairFeeParams({
      _roots: [foo.address, bar.address, qwe.address],
      _params: {
        beneficiary: MANAGER,
        beneficiary_numerator: 500,
        denominator: 1000000,
        pool_numerator: 0,
        referrer_numerator: 0,
        referrer_threshold: [
          [foo.address, 0],
          [bar.address, 0],
          [qwe.address, 0],
        ],
        threshold: [
          [foo.address, 1000000],
          [bar.address, 1000000],
          [qwe.address, 0],
        ],
      },
      _remainingGasTo: MANAGER,
    })
    .send({
      from: owner.address,
      amount: toNano(5),
    });

  await dexRoot.methods
    .setPairFeeParams({
      _roots: [foo.address, tst.address],
      _params: {
        beneficiary: MANAGER,
        beneficiary_numerator: 2500,
        denominator: 1000000,
        pool_numerator: 2500,
        referrer_numerator: 0,
        referrer_threshold: [
          [foo.address, 0],
          [tst.address, 0],
        ],
        threshold: [
          [foo.address, 1000000],
          [tst.address, 1000000],
        ],
      },
      _remainingGasTo: MANAGER,
    })
    .send({
      from: owner.address,
      amount: toNano(5),
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
