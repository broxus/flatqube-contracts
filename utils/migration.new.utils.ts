import { BigNumber } from 'bignumber.js';
import { Migration } from './migration';
import { Address, Contract, WalletTypes, zeroAddress } from 'locklift';
import { FactorySource } from '../build/factorySource';
import { Account } from 'everscale-standalone-client/nodejs';
import {
  logMigrationParams,
  logMigrationProcess,
  logMigrationSuccess,
} from './log.utils';

/**
 * Deploys new account with specified amount of EVER and saves migration
 * @param name name of the wallet for migration
 * @param amount how much EVER to draw for deployed account
 * @param signerId ID of the key pair from mnemonic phrase
 */
export const accountMigration = async (
  amount: BigNumber.Value,
  name = 'Account',
  signerId = '0',
): Promise<Account> => {
  // Get signer and factory
  const signer = await locklift.keystore.getSigner(signerId);

  logMigrationProcess('Account', 'constructor', 'Deploying Account...');
  logMigrationParams({ name, signerId, amount });

  const { account } = await locklift.factory.accounts.addNewAccount({
    value: locklift.utils.toNano(amount.toString()),
    publicKey: signer.publicKey,
    type: WalletTypes.WalletV3,
  });

  // Log and save address
  logMigrationSuccess(
    'Account',
    'constructor',
    `Deployed Account: ${account.address}`,
  );
  new Migration().store(account, name);

  return account;
};

export const dexPairMigration = async (
    account: Account,
    dexRoot: Contract<FactorySource['DexRoot']>,
    leftTokenSymbol: string,
    leftTokenRoot: Contract<FactorySource['TokenRootUpgradeable']>,
    rightTokenSymbol: string,
    rightTokenRoot: Contract<FactorySource['TokenRootUpgradeable']>,
): Promise<
  Contract<FactorySource['DexPair']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'dexPairMigration',
    'constructor',
    'Deploying DexPair...',
  );
  await locklift.tracing.trace(dexRoot.methods.deployPair({
      left_root: leftTokenRoot.address,
      right_root: rightTokenRoot.address,
      send_gas_to: account.address,
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  }), {allowedCodes: {compute: [60, 100]}});

  logMigrationProcess(
    'dexPairMigration',
    'constructor',
    'getExpectedPairAddress...',
  );

  const addressPair = await dexRoot.methods.getExpectedPairAddress({
      answerId: 1,
      left_root: leftTokenRoot.address,
      right_root: rightTokenRoot.address,
  }).call();

  const contract = await locklift.factory.getDeployedContract("DexPair", addressPair.value0);
  // Log and save address
  logMigrationSuccess(
    'dexPairMigration',
    'constructor',
    `Deployed dexPair: ${contract.address}`,
  );
  new Migration().store(contract, 'DexPair');

  return contract;
};

export const dexAccountMigration = async (
    account: Account,
    dexRoot: Contract<FactorySource['DexRoot']>
): Promise<
  Contract<FactorySource['DexAccount']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'dexAccountMigration',
    'constructor',
    'Deploying DexAccount...',
  );
  await locklift.tracing.trace(dexRoot.methods.deployAccount({
      account_owner: account.address,
      send_gas_to: account.address,
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  }));

  logMigrationProcess(
    'dexAccountMigration',
    'constructor',
    'getExpectedAccountAddress...',
  );

  const addressAccount = await dexRoot.methods.getExpectedAccountAddress({
      answerId: 1,
      account_owner: account.address
  }).call();

  const contract = await locklift.factory.getDeployedContract("DexAccount", addressAccount.value0);

  logMigrationSuccess(
    'dexAccountMigration',
    'constructor',
    `Deployed DexAccount: ${contract.address}`,
  );
  new Migration().store(contract, 'DexAccount');

  return contract;
};

export const dexVaultMigration = async (
    account: Account,
    dexRoot: Contract<FactorySource['DexRoot']>,
    token_factory: Contract<FactorySource['TokenFactory']>
): Promise<
  Contract<FactorySource['DexVault']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'dexVaultMigration',
    'constructor',
    'Deploying DexVault...',
  );
  const { contract } = await locklift.factory.deployContract({
      contract: 'DexVault',
      publicKey: signer.publicKey,
      initParams: {
        _nonce: locklift.utils.getRandomNonce()
      },
      constructorParams: {
        owner_: account.address,
        token_factory_: token_factory.address,
        root_: dexRoot.address
      },
      value: locklift.utils.toNano(15),
    });

  const platfromArtifacts = await locklift.factory.getContractArtifacts("DexPlatform")

  logMigrationProcess('dexVaultMigration', 'installPlatformOnce', 'installPlatformOnce...');
  await contract.methods.installPlatformOnce({code: platfromArtifacts.code}).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  })

  logMigrationProcess('dexVaultMigration', 'setVaultOnce', 'setVaultOnce on DexRoot...');
  await dexRoot.methods.setVaultOnce({new_vault: contract.address}).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  })

  logMigrationProcess('dexVaultMigration', 'setActive', 'setActive on DexRoot...');
  await dexRoot.methods.setActive({new_active: true}).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  })
  const LpTokenPending = await locklift.factory.getContractArtifacts("DexVaultLpTokenPendingV2")
  logMigrationProcess('dexVaultMigration', 'installOrUpdateLpTokenPendingCode', 'installOrUpdateLpTokenPendingCode...');
  await contract.methods.installOrUpdateLpTokenPendingCode({code: LpTokenPending.code}).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  })


  logMigrationSuccess(
    'dexVaultMigration',
    'constructor',
    `Deployed DexVault: ${contract.address}`,
  );
  new Migration().store(contract, 'DexVault');

  return contract;
};

export const tokenFactoryMigration = async (
    account: Account,
): Promise<
  Contract<FactorySource['TokenFactory']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'tokenFactoryMigration',
    'constructor',
    'Deploying TokenFactory...',
  );
  const { contract } = await locklift.factory.deployContract({
      contract: 'TokenFactory',
      publicKey: signer.publicKey,
      initParams: {
        randomNonce_: locklift.utils.getRandomNonce()
      },
      constructorParams: {
        _owner: account.address,
      },
      value: locklift.utils.toNano(15),
    });

  logMigrationProcess('TokenFactoryMigration', 'setRootCode', 'setRootCode...');
  const rootArtifact = await locklift.factory.getContractArtifacts("TokenRootUpgradeable")
  await contract.methods.setRootCode({
    _rootCode: rootArtifact.code
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  });

  logMigrationProcess('TokenFactoryMigration', 'setWalletCode', 'setWalletCode...');
  const walletArtifact = await locklift.factory.getContractArtifacts("TokenWalletUpgradeable")
  await contract.methods.setWalletCode({
    _walletCode: walletArtifact.code
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  });

  logMigrationSuccess(
    'TokenFactoryMigration',
    'constructor',
    `Deployed TokenFactory: ${contract.address}`,
  );
  new Migration().store(contract, 'TokenFactory');

  return contract;
};

export const orderFactoryMigration = async (
    account: Account,
    version: number,
    dexRoot: Contract<FactorySource['DexRoot']>
): Promise<
  Contract<FactorySource['OrderFactory']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'OrderFactoryMigration',
    'constructor',
    'Deploying OrderFactory...',
  );
  const { contract } = await locklift.factory.deployContract({
    contract: 'OrderFactory',
    publicKey: signer.publicKey,
    initParams: {
      randomNonce: locklift.utils.getRandomNonce(),
      dexRoot: dexRoot.address
    },
    constructorParams: {
      _owner: account.address,
      _version: version.toString(),
    },
    value: locklift.utils.toNano(15),
  });

  logMigrationProcess(
    'OrderFactoryMigration',
    'setOrderRootCode',
    'setOrderRootCode...',
  );

  const orderRootArtifacts = await locklift.factory.getContractArtifacts("OrderRoot")

  await locklift.tracing.trace( contract.methods.setOrderRootCode({
    _orderRootCode: orderRootArtifacts.code
  }).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  }))

  const orderPlatformArtifacts = await locklift.factory.getContractArtifacts("OrderPlatform")

  await locklift.tracing.trace( contract.methods.setPlatformCodeOnce({
    _orderPlatform: orderPlatformArtifacts.code
  }).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  }))

  logMigrationProcess(
    'OrderFactoryMigration',
    'setOrderCode',
    'setOrderCode...',
  );

  const orderArtifacts = await locklift.factory.getContractArtifacts("Order")

  await locklift.tracing.trace(contract.methods.setOrderCode({
    _orderCode: orderArtifacts.code
  }).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  }))

    logMigrationProcess(
    'OrderFactoryMigration',
    'setOrderClosedCode',
    'setOrderClosedCode...',
  );

  const orderClosedArtifacts = await locklift.factory.getContractArtifacts("OrderClosed")

  await locklift.tracing.trace(contract.methods.setOrderClosedCode({
    _orderClosedCode: orderClosedArtifacts.code
  }).send({
    amount: locklift.utils.toNano(15),
    from: account.address
  }))
  // Log and save address
  logMigrationSuccess(
    'OrderFactoryMigration',
    'constructor',
    `Deployed OrderFactory: ${contract.address}`,
  );
  new Migration().store(contract, 'OrderFactory');

  return contract;
};

export const orderRootMigration = async (
    account: Account,
    orderFactory: Contract<FactorySource['OrderFactory']>,
    token: Contract<FactorySource['TokenRootUpgradeable']>,
    callbackId: number = 1
): Promise<
  Contract<FactorySource['OrderRoot']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'OrderRootMigration',
    'constructor',
    'Deploying OrderRoot...',
  );

  await
      orderFactory.methods.createOrderRoot(
          {token: token.address, callbackId: callbackId}
      ).send({
        amount: locklift.utils.toNano(20),
        from: account.address
      }
  )


  const orderRootAddress = await orderFactory.methods.getExpectedAddressOrderRoot({
    answerId: 1,
    token: token.address
  }).call()
  console.log(orderRootAddress.value0)
  const contract = await locklift.factory.getDeployedContract(
      'OrderRoot',
      orderRootAddress.value0
  );

  // Log and save address
  logMigrationSuccess(
    'OrderRootMigration',
    'constructor',
    `Deployed OrderRoot: ${contract.address}`,
  );
  new Migration().store(contract, 'OrderRoot');

  return contract;
};

/**
 * Deploys a new TokenRootUpgradeable contract and saves migration
 * @param name name of the token
 * @param symbol symbol of the token
 * @param decimals token decimals
 * @param initialSupplyTo
 * @param initialSupply
 * @return TokenRootUpgradeable contract
 */
export const tokenRootMigration = async (
  name: string,
  symbol: string,
  decimals: number,
  rootOwner: Account,
  initialSupplyTo?: Address,
  initialSupply?: string,
): Promise<Contract<FactorySource['TokenRootUpgradeable']>> => {
  // Load signer and account
  const signer = await locklift.keystore.getSigner('0');

  // Load wallet and platform codes
  const Wallet = await locklift.factory.getContractArtifacts(
    'TokenWalletUpgradeable',
  );
  const Platform = await locklift.factory.getContractArtifacts(
    'TokenWalletPlatform',
  );

  const nonce = locklift.utils.getRandomNonce();

  logMigrationProcess(
    'TokenRootUpgradeable',
    'constructor',
    'Deploying TokenRootUpgradeable...',
  );
  logMigrationParams({
    name,
    symbol,
    decimals,
    nonce,
    initialSupplyTo,
    initialSupply,
  });
  const { contract } = await locklift.factory.deployContract({
    contract: 'TokenRootUpgradeable',
    publicKey: signer.publicKey,
    initParams: {
      randomNonce_: nonce,
      deployer_: zeroAddress,
      name_: name,
      symbol_: symbol,
      decimals_: decimals,
      walletCode_: Wallet.code,
      rootOwner_: rootOwner.address,
      platformCode_: Platform.code,
    },
    constructorParams: {
      initialSupplyTo: initialSupplyTo ? initialSupplyTo : zeroAddress,
      initialSupply: initialSupply ? initialSupply : '0',
      deployWalletValue: locklift.utils.toNano('5'),
      mintDisabled: false,
      burnByRootDisabled: true,
      burnPaused: true,
      remainingGasTo: rootOwner.address,
    },
    value: locklift.utils.toNano(10),
  });

  // Log and save address
  logMigrationSuccess(
    'TokenRootUpgradeable',
    'constructor',
    `Deployed TokenRootUpgradeable: ${contract.address}`,
  );
  new Migration().store(contract, `Token${symbol}`);

  return contract;
};

export const dexRootMigration = async (
  account: Account
): Promise<Contract<FactorySource['DexRoot']>> => {
  // Load signer and account
  const signer = await locklift.keystore.getSigner('0');
  const DexPair = await locklift.factory.getContractArtifacts('DexPair');
  const DexPlatform = await locklift.factory.getContractArtifacts('DexPlatform');
  const DexAccount = await locklift.factory.getContractArtifacts('DexAccount');

  logMigrationProcess('DexRoot', 'constructor', 'Deploying DexRoot...');

  const { contract } = await locklift.factory.deployContract({
    contract: 'DexRoot',
    publicKey: signer.publicKey,
    initParams: {
      _nonce: locklift.utils.getRandomNonce(),
    },
    constructorParams: {
      initial_owner: account.address,
      initial_vault: zeroAddress,
    },
    value: locklift.utils.toNano(15),
  });
  logMigrationProcess('DexRoot', 'installPlatformOnce', 'installPlatformOnce...');
  await contract.methods.installPlatformOnce({
    code: DexPlatform.code
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  });

  logMigrationProcess('DexRoot', 'installOrUpdateAccountCode', 'installOrUpdateAccountCode...');
  await contract.methods.installOrUpdateAccountCode({
    code: DexAccount.code
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  });

  logMigrationProcess('DexRoot', 'installOrUpdatePairCode', 'installOrUpdatePairCode...');
  await contract.methods.installOrUpdatePairCode({
    code: DexPair.code,
    pool_type: 1,
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  });

  logMigrationProcess('DexRoot', 'setActive', 'setActive...');
  await locklift.tracing.trace(contract.methods.setActive({
    new_active: true
  }).send({
    amount: locklift.utils.toNano(10),
    from: account.address
  }));
  // Log and save address
  logMigrationSuccess(
    'DexRoot',
    'constructor',
    `Deployed DexRoot: ${contract.address}`,
  );
  new Migration().store(contract, `DexRoot`);

  return contract;
};
