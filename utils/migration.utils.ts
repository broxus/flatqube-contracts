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

export const mockPriceAggregatorMigration = async (): Promise<
  Contract<FactorySource['MockPriceAggregator']>
> => {
  // Get signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess(
    'MockPriceAggregator',
    'constructor',
    'Deploying PriceAggregator...',
  );
  const { contract } = await locklift.factory.deployContract({
    contract: 'MockPriceAggregator',
    publicKey: signer.publicKey,
    initParams: { _nonce: locklift.utils.getRandomNonce() },
    constructorParams: {},
    value: locklift.utils.toNano(10),
  });
  // Log and save address
  logMigrationSuccess(
    'MockAggregator',
    'constructor',
    `Deployed PriceAggregator: ${contract.address}`,
  );
  new Migration().store(contract, 'PriceAggregator');

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
  initialSupplyTo?: Address,
  initialSupply?: string,
): Promise<Contract<FactorySource['TokenRootUpgradeable']>> => {
  // Load signer and account
  const signer = await locklift.keystore.getSigner('0');
  const account = await new Migration().loadAccount('Account', '0');

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
      rootOwner_: account.address,
      platformCode_: Platform.code,
    },
    constructorParams: {
      initialSupplyTo: initialSupplyTo ? initialSupplyTo : zeroAddress,
      initialSupply: initialSupply ? initialSupply : '0',
      deployWalletValue: locklift.utils.toNano('5'),
      mintDisabled: false,
      burnByRootDisabled: true,
      burnPaused: true,
      remainingGasTo: account.address,
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

export const lendingRootMigration = async (
  owner: string,
): Promise<Contract<FactorySource['LendingRoot']>> => {
  // Load signer and account
  const signer = await locklift.keystore.getSigner('0');

  logMigrationProcess('LendingRoot', 'constructor', 'Deploying LendingRoot...');

  const { contract } = await locklift.factory.deployContract({
    contract: 'LendingRoot',
    publicKey: signer.publicKey,
    initParams: {
      _nonce: locklift.utils.getRandomNonce(),
    },
    constructorParams: {
      _initialOwner: new Address(owner),
      _remainingGasTo: new Address(owner),
    },
    value: locklift.utils.toNano(1.5),
  });

  // Log and save address
  logMigrationSuccess(
    'LendingRoot',
    'constructor',
    `Deployed LendingRoot: ${contract.address}`,
  );
  new Migration().store(contract, `LendingRoot`);

  return contract;
};
