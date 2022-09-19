const {Migration, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();

async function main() {
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContract('DexVaultLpTokenPendingV2');

  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  account.afterRun = afterRun;
  const [keyPair] = await locklift.keys.getKeyPairs();

  const dexVaultPrev = migration.load(await locklift.factory.getContract('DexVaultPrev'), 'DexVault');
  const DexVault = await locklift.factory.getContract('DexVault');

  console.log(`Upgrading DexVault contract: ${dexVaultPrev.address}`);
  await account.runTarget({
    contract: dexVaultPrev,
    method: 'upgrade',
    params: {
      code: DexVault.code
    },
    value: locklift.utils.convertCrystal(6, 'nano'),
    keyPair
  });
  DexVault.setAddress(dexVaultPrev.address);

  console.log(`DexVault: installing VaultLpTokenPendingV2 code...`);
  const tx = await account.runTarget({
    contract: DexVault,
    method: 'installOrUpdateLpTokenPendingCode',
    params: {code: DexVaultLpTokenPendingV2.code},
    keyPair
  });
  displayTx(tx);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
