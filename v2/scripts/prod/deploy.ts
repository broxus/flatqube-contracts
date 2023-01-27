const {Migration, displayTx} = require(process.cwd() + '/scripts/utils')
const { Command } = require('commander');

import {toNano, WalletTypes, getRandomNonce, zeroAddress, Address} from "locklift";

async function main() {
  const program = new Command();
  const migration = new Migration();
  migration.reset();

  program
      .allowUnknownOption()
      .option('-o, --owner <owner>', 'owner');

  program.parse(process.argv);

  const options = program.opts();

  const newOwner = new Address(options.owner);

  // ============ DEPLOYER ACCOUNT ============

  const signer = await locklift.keystore.getSigner('0');
  const account = (await locklift.factory.accounts.addNewAccount({
    type: WalletTypes.EverWallet,
    value: toNano(10),
    publicKey: signer!.publicKey,
  })).account;

  await locklift.provider.sendMessage({
    sender: account.address,
    recipient: account.address,
    amount: toNano(1),
    bounce: false
  })

  const name = `Account1`;
  migration.store(account, name);
  console.log(`${name}: ${account.address}`);

  // ============ TOKEN FACTORY ============
  const TokenFactory = await locklift.factory.getContractArtifacts('TokenFactory');

  const TokenRoot = await locklift.factory.getContractArtifacts('TokenRootUpgradeable');
  const TokenWallet = await locklift.factory.getContractArtifacts('TokenWalletUpgradeable');
  const TokenWalletPlatform = await locklift.factory.getContractArtifacts('TokenWalletPlatform');

  const {contract: tokenFactory} = await locklift.factory.deployContract({
    contract: 'TokenFactory',
    constructorParams: {
      _owner: account.address
    },
    initParams: {
      randomNonce_: getRandomNonce(),
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });
  migration.store(tokenFactory, 'TokenFactory');

  console.log(`TokenFactory: ${tokenFactory.address}`);

  console.log(`TokenFactory.setRootCode`);
  await tokenFactory.methods.setRootCode({_rootCode: TokenRoot.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  console.log(`TokenFactory.setWalletCode`);
  await tokenFactory.methods.setWalletCode({_walletCode: TokenWallet.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  console.log(`TokenFactory.setWalletPlatformCode`);
  await tokenFactory.methods.setWalletPlatformCode({_walletPlatformCode: TokenWalletPlatform.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  // ============ ROOT AND VAULT ============
  const DexPlatform = await locklift.factory.getContractArtifacts('DexPlatform');
  const DexAccount = await locklift.factory.getContractArtifacts('DexAccount');
  const DexPair = await locklift.factory.getContractArtifacts('DexPair');
  const DexStablePair = await locklift.factory.getContractArtifacts('DexStablePair');
  const DexStablePool = await locklift.factory.getContractArtifacts('DexStablePool');
  const DexVaultLpTokenPendingV2 = await locklift.factory.getContractArtifacts('DexVaultLpTokenPendingV2');

  console.log(`Deploying DexRoot...`);
  const {contract: dexRoot} = await locklift.factory.deployContract({
    contract: 'DexRoot',

    constructorParams: {
      initial_owner: account.address,
      initial_vault: zeroAddress
    },

    initParams: {
      _nonce: getRandomNonce(),
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });
  migration.store(dexRoot, 'DexRoot');
  console.log(`DexRoot address: ${dexRoot.address}`);


  console.log(`DexRoot: installing Platform code...`);

  let tx = await dexRoot.methods.installPlatformOnce({code: DexPlatform.code}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexAccount code...`);

  tx = await dexRoot.methods.installOrUpdateAccountCode({code: DexAccount.code}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair CONSTANT_PRODUCT code...`);

  tx = await dexRoot.methods.installOrUpdatePairCode({code: DexPair.code, pool_type: 1}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexStablePool code...`);

  tx = await dexRoot.methods.installOrUpdatePoolCode({code: DexStablePool.code, pool_type: 3}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);

  tx = await dexRoot.methods.installOrUpdatePairCode({code: DexStablePair.code, pool_type: 2}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`Deploying DexVault...`);
  const {contract: dexVault} = await locklift.factory.deployContract({
    contract: 'DexVault',
    constructorParams: {
      owner_: account.address,
      token_factory_: migration.getAddress('TokenFactory').toString(),
      root_: dexRoot.address
    },
    initParams: {
      _nonce: getRandomNonce()
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });
  console.log(`DexVault address: ${dexVault.address}`);
  migration.store(dexVault, 'DexVault');

  console.log(`DexVault: installing Platform code...`);

  tx = await dexVault.methods.installPlatformOnce({code: DexPlatform.code}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexVault: installing VaultLpTokenPendingV2 code...`);

  tx = await dexVault.methods.installOrUpdateLpTokenPendingCode({code: DexVaultLpTokenPendingV2.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  console.log(`DexRoot: installing vault address...`);

  tx = await dexRoot.methods.setVaultOnce({new_vault: dexVault.address}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);

  console.log(`DexRoot: set Dex is active...`);

  tx = await dexRoot.methods.setActive( {new_active: true}).send({
    from: account.address,
    amount: toNano(2)
  });
  displayTx(tx);


  if (options.owner) {
    console.log(`Transferring DEX ownership from ${account.address} to ${options.owner}`);

    console.log(`Set manager for DexRoot, manager = ${account.address}`);
    let tx = await dexRoot.methods.setManager({_newManager: account.address}).send({
      from: account.address,
      amount: toNano(2)
    });
    displayTx(tx);

    console.log(`Transfer for DexRoot: ${dexRoot.address}`);

    tx = await dexRoot.methods.transferOwner(
        {
          new_owner: newOwner
        }
    ).send({
      from: account.address,
      amount: toNano(1)
    });
    displayTx(tx);

    console.log(`Transfer for DexVault: ${dexRoot.address}`);

    tx = await dexVault.methods.transferOwner(
        {
          new_owner: newOwner
        }
    ).send({
      from: account.address,
      amount: toNano(1)
    });
    displayTx(tx);

    console.log(`Transfer for TokenFactory: ${dexRoot.address}`);

    tx = await tokenFactory.methods.transferOwner(
        {
          answerId: 0,
          newOwner: newOwner
        }
    ).send({
      from: account.address,
      amount: toNano(1)
    });
    displayTx(tx);
  }

  console.log('='.repeat(64));
  for (const alias in migration.migration_log) {
    console.log(`${alias}: ${migration.migration_log[alias].address}`);
  }
  console.log('='.repeat(64));
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
