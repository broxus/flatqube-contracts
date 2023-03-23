const {getRandomNonce, Migration, afterRun, displayTx} = require(process.cwd()+'/scripts/utils')
const { Command } = require('commander');
const program = new Command();

program
    .allowUnknownOption()
    .option('-rcn, --root_contract_name <root_contract_name>', 'DexRoot contract name')
    .option('-prcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-plcn, --pool_contract_name <pool_contract_name>', 'DexStablePool contract name')
    .option('-stcn, --stableswap_contract_name <stableswap_contract_name>', 'DexStablePair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')
    .option('-vcn, --vault_contract_name <vault_contract_name>', 'DexVault contract name')
    .option('-tvcn, --token_vault_contract_name <token_vault_contract_name>', 'DexTokenVault contract name')
    .option('-lpcn, --lp_pending_contract_name <lp_pending_contract_name>', 'LpTokenPending contract name');

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.pool_contract_name = options.pool_contract_name || 'DexStablePool';
options.stableswap_contract_name = options.stableswap_contract_name || 'DexStablePair';
options.account_contract_name = options.account_contract_name || 'DexAccount';
options.vault_contract_name = options.vault_contract_name || 'DexVault';
options.token_vault_contract_name = options.token_vault_contract_name || 'DexTokenVault';
options.lp_pending_contract_name = options.lp_pending_contract_name || 'DexVaultLpTokenPendingV2';

let tx;

async function main() {
  const migration = new Migration();
  const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  if (locklift.tracing) {
    locklift.tracing.allowCodesForAddress(account.address, {compute: [100]});
  }
  account.afterRun = afterRun;

  const DexPlatform = await locklift.factory.getContract('DexPlatform', 'precompiled');
  const DexAccount = await locklift.factory.getContract(options.account_contract_name);
  const DexPair = await locklift.factory.getContract(options.pair_contract_name);
  const DexStablePair = await locklift.factory.getContract(options.stableswap_contract_name);
  const DexStablePool = await locklift.factory.getContract(options.pool_contract_name);
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContract(options.lp_pending_contract_name);
  const DexTokenVault = await locklift.factory.getContract(options.token_vault_contract_name);

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

  console.log(`DexRoot: installing vault address...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'setVaultOnce',
    params: {new_vault: dexVault.address},
    keyPair
  });
  displayTx(tx);

  console.log('DexRoot: installing vault code...');
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdateTokenVaultCode',
    params: {
      _newCode: DexTokenVault.code,
      _remainingGasTo: account.address,
    },
    keyPair,
  });
  displayTx(tx);

  console.log('DexRoot: installing lp pending code...');
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdateLpTokenPendingCode',
    params: {
      _newCode: DexVaultLpTokenPendingV2.code,
      _remainingGasTo: account.address,
    },
    keyPair,
  });
  displayTx(tx);

  const TokenFactory = migration.load(await locklift.factory.getContract('TokenFactory'), 'TokenFactory').address;
  console.log('DexRoot: set token factory...');
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'setTokenFactory',
    params: {
      _newTokenFactory: TokenFactory,
      _remainingGasTo: account.address,
    },
    keyPair,
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

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdatePairCode',
    params: {code: DexStablePair.code, pool_type: 2},
    keyPair
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexStablePool code...`);
  tx = await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdatePoolCode',
    params: {code: DexStablePool.code, pool_type: 3},
    keyPair
  });
  displayTx(tx);

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
