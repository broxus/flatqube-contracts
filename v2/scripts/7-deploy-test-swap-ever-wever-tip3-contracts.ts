import { Migration } from '../utils/migration';
import { toNano, getRandomNonce } from 'locklift';

async function main() {
  const migration = new Migration();

  const signer = await locklift.keystore.getSigner('0');

  const weverRoot = migration.loadContract(
    'TokenRootUpgradeable',
    'WEVERRoot',
  ).address;
  const weverVault = migration.loadContract(
    'TestWeverVault',
    'WEVERVault',
  ).address;

  console.log(`Deploying EverToTip3 contract...`);
  const { contract: everToTip3 } = await locklift.factory.deployContract({
    contract: 'EverToTip3',
    constructorParams: {},
    initParams: {
      randomNonce_: getRandomNonce(),
      weverRoot: weverRoot,
      weverVault: weverVault,
    },
    publicKey: signer.publicKey,
    value: toNano(2),
  });
  console.log(`EverToTip3 deploing end. Address: ${everToTip3.address}`);

  console.log(`Deploying Tip3ToEver...`);
  const { contract: tip3ToEver } = await locklift.factory.deployContract({
    contract: 'Tip3ToEver',
    constructorParams: {},
    initParams: {
      randomNonce_: getRandomNonce(),
      weverRoot: weverRoot,
      weverVault: weverVault,
    },
    publicKey: signer.publicKey,
    value: toNano(2),
  });
  console.log(`Tip3ToEver deploying end. Address: ${tip3ToEver.address}`);

  console.log(`Deploying EverWeverToTip3...`);
  const { contract: everWEverToTIP3 } = await locklift.factory.deployContract({
    contract: 'EverWeverToTip3',
    constructorParams: {},
    initParams: {
      randomNonce_: getRandomNonce(),
      weverRoot: weverRoot,
      weverVault: weverVault,
      everToTip3: everToTip3.address,
    },
    publicKey: signer.publicKey,
    value: toNano(2),
  });
  console.log(
    `EverWeverToTip3 deploing end. Address: ${everWEverToTIP3.address}`,
  );

  migration.store(everToTip3, 'EverToTip3');
  migration.store(tip3ToEver, 'Tip3ToEver');
  migration.store(everWEverToTIP3, 'EverWeverToTip3');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
