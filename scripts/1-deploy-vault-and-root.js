const {getRandomNonce, Migration, afterRun, displayTx} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-rcn, --root_contract_name <root_contract_name>', 'DexRoot contract name')
    .option('-prcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')
    .option('-vcn, --vault_contract_name <vault_contract_name>', 'DexVault contract name');

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
// options.pool_contract_name = options.pool_contract_name || 'DexStablePool';
options.account_contract_name = options.account_contract_name || 'DexAccount';
options.vault_contract_name = options.vault_contract_name || 'DexVault';

let tx;

async function main() {
  const migration = new Migration();
  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  if (locklift.tracing) {
    locklift.tracing.allowCodesForAddress(account.address, {compute: [100]});
  }
  account.afterRun = afterRun;

  const DexPlatform = await locklift.factory.getContract('DexPlatform');
  const DexAccount = await locklift.factory.getContract(options.account_contract_name);
  const DexPair = await locklift.factory.getContract(options.pair_contract_name);
  const DexStablePair = await locklift.factory.getContract('DexStablePair');
  const DexStablePool = await locklift.factory.getContract('DexStablePool');
  const DexVaultLpTokenPending = await locklift.factory.getContract('DexVaultLpTokenPending');
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContract('DexVaultLpTokenPendingV2');

  const [keyPair] = await locklift.keys.getKeyPairs();

  const DexRoot = await locklift.factory.getContract(options.root_contract_name);
  console.log(`Deploying DexRoot...`);
  const dexRoot = await locklift.giver.deployContract({
    contract: DexRoot,
    constructorParams: {
      initial_owner: account.address,
      initial_vault: locklift.ton.zero_address
    },
    initParams: {
      _nonce: getRandomNonce(),
    },
    keyPair,
  }, locklift.utils.convertCrystal(2, 'nano'));
  console.log(`DexRoot address: ${dexRoot.address}`);

  const DexVault = await locklift.factory.getContract(options.vault_contract_name);
  console.log(`Deploying DexVault...`);
  const dexVault = await locklift.giver.deployContract({
    contract: DexVault,
    constructorParams: {
      owner_: account.address,
      token_factory_: migration.load(await locklift.factory.getContract('TokenFactory'), 'TokenFactory').address,
      root_: dexRoot.address
    },
    initParams: {
      _nonce: getRandomNonce(),
    },
    keyPair,
  }, locklift.utils.convertCrystal(2, 'nano'));
  console.log(`DexVault address: ${dexVault.address}`);

  console.log(`DexVault: installing Platform code...`);
  tx = await account.runTarget({
    contract: dexVault,
    method: 'installPlatformOnce',
    params: {code: DexPlatform.code},
    keyPair
  });
  displayTx(tx);

  if (options.vault_contract_name === 'DexVaultPrev') {
    console.log(`DexVault: installing VaultLpTokenPending code...`);
    tx = await account.runTarget({
      contract: dexVault,
      method: 'installOrUpdateLpTokenPendingCode',
      params: {code: DexVaultLpTokenPending.code},
      keyPair
    });
  } else {
    console.log(`DexVault: installing VaultLpTokenPendingV2 code...`);
    tx = await account.runTarget({
      contract: dexVault,
      method: 'installOrUpdateLpTokenPendingCode',
      params: {code: DexVaultLpTokenPendingV2.code},
      keyPair
    });
  }
  displayTx(tx);

  console.log(`DexRoot: installing vault address...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'setVaultOnce',
    params: {new_vault: dexVault.address},
    keyPair
  });
  displayTx(tx);

  console.log(`DexRoot: installing Platform code...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installPlatformOnce',
    params: {code: DexPlatform.code},
    keyPair
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexAccount code...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdateAccountCode',
    params: {code: DexAccount.code},
    keyPair
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair CONSTANT_PRODUCT code...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdatePairCode',
    params: {code: DexPair.code, pool_type: 1},
    keyPair
  });
  displayTx(tx);

  // console.log(`DexRoot: installing DexStablePool code...`);
  // tx = await account.runTarget({
  //   contract: dexRoot,
  //   method: 'installOrUpdatePoolCode',
  //   params: {code: DexStablePool.code, pool_type: 2},
  //   keyPair
  // });
  // displayTx(tx);
  // console.log(`DexRoot: installing DexPair STABLESWAP code...`);
  // tx = await account.runTarget({
  //   contract: dexRoot,
  //   method: 'installOrUpdatePairCode',
  //   params: {code: DexStablePair.code, pool_type: 2},
  //   keyPair
  // });
  // displayTx(tx);

  console.log(`DexRoot: set Dex is active...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'setActive',
    params: {new_active: true},
    keyPair
  });
  displayTx(tx);

  migration.store(dexRoot, 'DexRoot');
  migration.store(dexVault, 'DexVault');
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
