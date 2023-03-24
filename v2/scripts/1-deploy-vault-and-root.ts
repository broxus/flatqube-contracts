import { toNano, getRandomNonce, zeroAddress } from 'locklift';
import { Migration, displayTx } from '../utils/migration';

import { Command } from 'commander';
const program = new Command();

program
  .allowUnknownOption()
  .option(
    '-rcn, --root_contract_name <root_contract_name>',
    'DexRoot contract name',
  )
  .option(
    '-prcn, --pair_contract_name <pair_contract_name>',
    'DexPair contract name',
  )
  .option(
    '-plcn, --pool_contract_name <pool_contract_name>',
    'DexStablePool contract name',
  )
  .option(
    '-stcn, --stableswap_contract_name <stableswap_contract_name>',
    'DexStablePair contract name',
  )
  .option(
    '-acn, --account_contract_name <account_contract_name>',
    'DexAccount contract name',
  )
  .option(
    '-vcn, --vault_contract_name <vault_contract_name>',
    'DexVault contract name',
  )
  .option(
    '-tvcn, --token_vault_contract_name <token_vault_contract_name>',
    'DexTokenVault contract name',
  )
  .option(
    '-lpcn, --lp_pending_contract_name <lp_pending_contract_name>',
    'LpTokenPending contract name',
  );

program.parse(process.argv);

const options = program.opts();
options.root_contract_name = options.root_contract_name || 'DexRoot';
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.pool_contract_name = options.pool_contract_name || 'DexStablePool';
options.stableswap_contract_name =
  options.stableswap_contract_name || 'DexStablePair';
options.account_contract_name = options.account_contract_name || 'DexAccount';
options.vault_contract_name = options.vault_contract_name || 'DexVault';
options.token_vault_contract_name =
  options.token_vault_contract_name || 'DexTokenVault';
options.lp_pending_contract_name =
  options.lp_pending_contract_name || 'DexVaultLpTokenPendingV2';

async function main() {
  const migration = new Migration();

  const signer = await locklift.keystore.getSigner('0');
  const account = await migration.loadAccount('Account1', '0');

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  const DexPlatform = await locklift.factory.getContractArtifacts(
    'DexPlatform',
  );
  const DexAccount = await locklift.factory.getContractArtifacts(
    options.account_contract_name,
  );
  const DexPair = await locklift.factory.getContractArtifacts(
    options.pair_contract_name,
  );
  const DexStablePair = await locklift.factory.getContractArtifacts(
    options.stableswap_contract_name,
  );
  const DexStablePool = await locklift.factory.getContractArtifacts(
    options.pool_contract_name,
  );
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContractArtifacts(
    options.lp_pending_contract_name,
  );
  const DexTokenVault = await locklift.factory.getContractArtifacts(
    options.token_vault_contract_name,
  );

  console.log(`Deploying DexRoot...`);
  const { contract: dexRoot } =
    await locklift.factory.deployContract<'DexRoot'>({
      contract: options.root_contract_name,
      constructorParams: {
        initial_owner: account.address,
        initial_vault: zeroAddress,
      },
      initParams: {
        _nonce: getRandomNonce(),
      },
      publicKey: signer!.publicKey,
      value: toNano(2),
    });
  console.log(`DexRoot address: ${dexRoot.address}`);

  console.log(`Deploying DexVault...`);
  const { contract: dexVault } =
    await locklift.factory.deployContract<'DexVault'>({
      contract: options.vault_contract_name,
      constructorParams: {
        owner_: account.address,
        root_: dexRoot.address,
      },
      initParams: {
        _nonce: getRandomNonce(),
      },
      publicKey: signer!.publicKey,
      value: toNano(2),
    });
  console.log(`DexVault address: ${dexVault.address}`);

  console.log(`DexVault: installing Platform code...`);
  let tx = await dexVault.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing vault address...`);
  tx = await dexRoot.methods
    .setVaultOnce({ new_vault: dexVault.address })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log('DexRoot: installing vault code...');
  tx = await dexRoot.methods
    .installOrUpdateTokenVaultCode({
      _newCode: DexTokenVault.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log('DexRoot: installing lp pending code...');
  tx = await dexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: DexVaultLpTokenPendingV2.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log('DexRoot: set Token Factory...');
  tx = await dexRoot.methods
    .setTokenFactory({
      _newTokenFactory: migration.loadContract('TokenFactory', 'TokenFactory')
        .address,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing Platform code...`);
  tx = await dexRoot.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexAccount code...`);
  tx = await dexRoot.methods
    .installOrUpdateAccountCode({ code: DexAccount.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair CONSTANT_PRODUCT code...`);
  tx = await dexRoot.methods
    .installOrUpdatePairCode({ code: DexPair.code, pool_type: 1 })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexStablePool code...`);
  tx = await dexRoot.methods
    .installOrUpdatePoolCode({ code: DexStablePool.code, pool_type: 3 })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);
  tx = await dexRoot.methods
    .installOrUpdatePairCode({ code: DexStablePair.code, pool_type: 2 })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: set Dex is active...`);
  tx = await dexRoot.methods.setActive({ new_active: true }).send({
    from: account.address,
    amount: toNano(2),
  });
  displayTx(tx);

  migration.store(dexRoot, 'DexRoot');
  migration.store(dexVault, 'DexVault');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
