const { Migration, TOKEN_CONTRACTS_PATH } = require('../scripts/utils');
const logger = require('mocha-logger');

// Utility to save addresses of deployed contracts
const migration = new Migration();

/**
 * Deploys a new Wallet contract with specified amount of evers
 * @param amount amount of evers to deposit
 * @return Account contract with address for interaction
 */
const accountMigration = async (amount) => {
  const Account = await locklift.factory.getAccount('Wallet');
  const [keyPair] = await locklift.keys.getKeyPairs();
  Account.setKeyPair(keyPair);

  logger.log('Deploying Account...');
  await locklift.giver.deployContract(
    {
      contract: Account,
      constructorParams: {},
      initParams: { _randomNonce: locklift.utils.getRandomNonce() },
      keyPair: Account.keyPair,
    },
    locklift.utils.convertCrystal(amount, 'nano'),
  );

  // Log and save address
  logger.success(`Account: ${Account.address}`);
  migration.store(Account, 'Account');

  return Account;
};

/**
 * Deploys a new TokenFactory contract
 * @param account account to pay gas
 * @return TokenFactory contract with address for interaction
 */
const tokenFactoryMigration = async (account) => {
  // Load contracts' codes
  const TokenFactory = await locklift.factory.getContract('TokenFactory');
  const TokenRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
  const TokenWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
  const TokenWalletPlatform = await locklift.factory.getContract('TokenWalletPlatform', TOKEN_CONTRACTS_PATH);

  logger.log('Deploying TokenFactory...');
  await locklift.giver.deployContract(
    {
      contract: TokenFactory,
      constructorParams: { _owner: account.address },
      initParams: { randomNonce_: locklift.utils.getRandomNonce() },
      keyPair: account.keyPair,
    },
    locklift.utils.convertCrystal(10, 'nano'),
  );

  logger.log('[TokenFactory] setRootCode...');
  await account.runTarget({
    contract: TokenFactory,
    method: 'setRootCode',
    params: { _rootCode: TokenRoot.code },
    keyPair: account.keyPair,
  });

  logger.log('[TokenFactory] setWalletCode...');
  await account.runTarget({
    contract: TokenFactory,
    method: 'setWalletCode',
    params: { _walletCode: TokenWallet.code },
    keyPair: account.keyPair,
  });

  logger.log('[TokenFactory] setWalletPlatformCode...');
  await account.runTarget({
    contract: TokenFactory,
    method: 'setWalletPlatformCode',
    params: { _walletPlatformCode: TokenWalletPlatform.code },
    keyPair: account.keyPair,
  });

  // Log and save address
  logger.success(`TokenFactory: ${TokenFactory.address}`);
  migration.store(TokenFactory, 'TokenFactory');

  return TokenFactory;
};

/**
 * Deploys a new TokenRoot contract and creates a new TIP-3 token
 * @param account account to pay gas
 * @param name name of the token
 * @param symbol tag of the token
 * @param decimals token decimals
 * @return TokenRoot contract with address for interaction
 */
const tokenMigration = async (
  account,
  name,
  symbol,
  decimals = 18,
) => {
  // Load contracts' codes
  const TokenRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
  const TokenWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
  const TokenWalletPlatform = await locklift.factory.getContract('TokenWalletPlatform', TOKEN_CONTRACTS_PATH);

  logger.log('Deploying TokenRoot...');
  await locklift.giver.deployContract(
    {
      contract: TokenRoot,
      constructorParams: {
        initialSupplyTo: locklift.utils.zeroAddress,
        initialSupply: '0',
        deployWalletValue: '0',
        mintDisabled: false,
        burnByRootDisabled: true,
        burnPaused: true,
        remainingGasTo: locklift.utils.zeroAddress,
      },
      initParams: {
        randomNonce_: locklift.utils.getRandomNonce(),
        deployer_: locklift.utils.zeroAddress,
        name_: name,
        symbol_: symbol,
        decimals_: decimals,
        walletCode_: TokenWallet.code,
        rootOwner_: account.address,
        platformCode_: TokenWalletPlatform.code,
      },
      keyPair: account.keyPair,
    },
    locklift.utils.convertCrystal('10', 'nano'),
  );

  // Log and save address
  logger.success(`TokenRoot${symbol}: ${TokenRoot.address}`);
  migration.store(TokenRoot, `TokenRoot${symbol}`);

  return TokenRoot;
};

/**
 * Deploys a new DexRoot contract
 * @param account account to pay gas
 * @param prev previous or current contract's version
 * @return DexRoot contract with address for interaction
 */
const dexRootMigration = async (account, prev = false) => {
  // Load contracts' codes
  const DexRoot = await locklift.factory.getContract(prev ? 'DexRootPrev' : 'DexRoot');
  const DexPair = await locklift.factory.getContract(prev ? 'DexPairPrev' : 'DexPair');
  const DexPlatform = await locklift.factory.getContract('DexPlatform', 'precompiled');
  const DexAccount = await locklift.factory.getContract('DexAccount');

  logger.log('Deploying DexRoot...');
  await locklift.giver.deployContract(
    {
      contract: DexRoot,
      constructorParams: {
        initial_owner: account.address,
        initial_vault: locklift.ton.zero_address,
      },
      initParams: { _nonce: locklift.utils.getRandomNonce() },
      keyPair: account.keyPair,
    },
    locklift.utils.convertCrystal(10, 'nano'),
  );

  logger.log('[DexRoot] installPlatformOnce...');
  await account.runTarget({
    contract: DexRoot,
    method: 'installPlatformOnce',
    params: { code: DexPlatform.code },
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] installOrUpdateAccountCode...');
  await account.runTarget({
    contract: DexRoot,
    method: 'installOrUpdateAccountCode',
    params: { code: DexAccount.code },
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] installOrUpdatePairCode...');
  await account.runTarget({
    contract: DexRoot,
    method: 'installOrUpdatePairCode',
    params: {
      code: DexPair.code,
      pool_type: 1,
    },
    keyPair: account.keyPair,
  });

  // Log and save address
  logger.success(`DexRoot: ${DexRoot.address}`);
  migration.store(DexRoot, 'DexRoot');

  return DexRoot;
};

/**
 * Deploys a new DexVault contract
 * @param account account to pay gas
 * @param tokenFactory TokenFactory contract with address
 * @param dexRoot DexRoot contract with address
 * @return DexVault contract with address for interaction
 */
const dexVaultMigration = async (
  account,
  tokenFactory,
  dexRoot,
) => {
  // Load contracts' codes
  const DexPlatform = await locklift.factory.getContract('DexPlatform', 'precompiled');
  const DexVault = await locklift.factory.getContract('DexVault');
  const DexVaultLpTokenPending = await locklift.factory.getContract('DexVaultLpTokenPending');

  logger.log('Deploying DexVault...');
  await locklift.giver.deployContract(
    {
      contract: DexVault,
      constructorParams: {
        owner_: account.address,
        token_factory_: tokenFactory.address,
        root_: dexRoot.address,
      },
      initParams: { _nonce: locklift.utils.getRandomNonce() },
      keyPair: account.keyPair,
    },
    locklift.utils.convertCrystal(10, 'nano'),
  );

  logger.log('[DexVault] installPlatformOnce...');
  await account.runTarget({
    contract: DexVault,
    method: 'installPlatformOnce',
    params: { code: DexPlatform.code },
    keyPair: account.keyPair,
  });

  logger.log('[DexVault] installOrUpdateLpTokenPendingCode...');
  await account.runTarget({
    contract: DexVault,
    method: 'installOrUpdateLpTokenPendingCode',
    params: { code: DexVaultLpTokenPending.code },
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] setVaultOnce...');
  await account.runTarget({
    contract: dexRoot,
    method: 'setVaultOnce',
    params: { new_vault: DexVault.address },
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] setActive...');
  await account.runTarget({
    contract: dexRoot,
    method: 'setActive',
    params: { new_active: true },
    keyPair: account.keyPair,
  });

  // Log and save address
  logger.success(`DexVault: ${DexVault.address}`);
  migration.store(DexVault, 'DexVault');

  return DexVault;
};

/**
 * Deploys a new DexPair contract
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param leftTokenSymbol tag of the left pair's token
 * @param leftTokenRoot TokenRoot contract with address of the left pair's token
 * @param rightTokenSymbol tag of the right pair's token
 * @param rightTokenRoot TokenRoot contract with address of the right pair's token
 * @param prev previous or current contract's version
 * @return DexPair contract with address for interaction
 */
const dexPairMigration = async (
  account,
  dexRoot,
  leftTokenSymbol,
  leftTokenRoot,
  rightTokenSymbol,
  rightTokenRoot,
  prev = false,
) => {
  // Load contract's code
  const DexPair = await locklift.factory.getContract(prev ? 'DexPairPrev' : 'DexPair');

  logger.log('[DexRoot] deployPair...');
  await account.runTarget({
    contract: dexRoot,
    method: 'deployPair',
    params: {
      left_root: leftTokenRoot.address,
      right_root: rightTokenRoot.address,
      send_gas_to: account.address,
    },
    value: locklift.utils.convertCrystal(10, 'nano'),
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] getExpectedPairAddress...');
  DexPair.address = await dexRoot.call({
    method: 'getExpectedPairAddress',
    params: {
      left_root: leftTokenRoot.address,
      right_root: rightTokenRoot.address,
    },
  });

  // Log and save address
  logger.success(`DexPair${leftTokenSymbol}${rightTokenSymbol}: ${DexPair.address}`);
  migration.store(DexPair, `DexPair${leftTokenSymbol}${rightTokenSymbol}`);

  return DexPair;
};

/**
 * Deploys TokenRoot contracts for specified tokens
 * @param account account to pay gas
 * @param tokens tokens' data for creation
 * @return TIP-3 tokens' roots
 */
const createTokens = async (account, tokens) => {
  const roots = {};

  for (const token of tokens) {
    roots[token.symbol] = await tokenMigration(
      account,
      token.name,
      token.symbol
    );
  }

  return roots;
};

/**
 * Deploys DexPair contracts for specified pairs
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param roots TIP-3 tokens' roots
 * @param pairs pairs' data for creation
 * @param prev previous or current contract's version
 * @return DexPairs contracts with addresses for interaction
 */
const createPairs = async (
  account,
  dexRoot,
  roots,
  pairs,
  prev = false,
) => {
  const dexPairs = {};

  for (const pair of pairs) {
    dexPairs[`${pair.left}${pair.right}`] =
      await dexPairMigration(
        account,
        dexRoot,
        pair.left,
        roots[pair.left],
        pair.right,
        roots[pair.right],
        prev,
      );
  }

  return dexPairs;
};

/**
 * Creates DEX with specified params
 * @param account account to pay gas
 * @param tokens TIP-3 tokens to create
 * @param pairs DEX pairs to create
 * @param prev previous or current contracts' versions
 * @return DexRoot, TokenRoot, DexPair contracts with addresses for interaction
 */
const createDex = async (
  account,
  tokens,
  pairs,
  prev = false,
) => {
  // Deploy TIP-3 tokens
  const tokenFactory = await tokenFactoryMigration(account);
  const roots = await createTokens(account, tokens);

  // Deploy Root, Vault and pairs
  const dexRoot = await dexRootMigration(account, prev);
  await dexVaultMigration(account, tokenFactory, dexRoot);
  const dexPairs = await createPairs(account, dexRoot, roots, pairs, prev);

  return [dexRoot, roots, dexPairs];
};

module.exports = {
  accountMigration,
  tokenFactoryMigration,
  tokenMigration,
  dexRootMigration,
  dexVaultMigration,
  dexPairMigration,
  createTokens,
  createPairs,
  createDex,
};
