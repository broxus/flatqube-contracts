import { Account } from "everscale-standalone-client";
import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  WalletTypes,
  zeroAddress,
} from "locklift";
import {
  DexPairAbi,
  DexRootAbi,
  DexVaultAbi,
  TokenFactoryAbi,
} from "../../build/factorySource";

export interface ITokenRoot {
  name: string;
  symbol: string;
}

/**
 * Deploys a new Wallet contract with specified amount of evers
 * @param amount amount of evers to deposit
 * @return Account contract with address for interaction
 */
export const accountMigration = async (amount: string | number) => {
  console.log("Deploying Account...");
  const acc = await locklift.deployments.deployAccounts(
    [
      {
        deploymentName: "Account",
        accountSettings: {
          type: WalletTypes.EverWallet,
          value: toNano(amount),
          nonce: getRandomNonce(),
        },
        signerId: "0",
      },
    ],
    true,
  );

  // Log and save address
  console.log(`Account: ${acc[0].account.address}`);

  return acc[0].account;
};

/**
 * Deploys a new TokenFactory contract
 * @param account account to pay gas
 * @return TokenFactory contract with address for interaction
 */
export const tokenFactoryMigration = async (account: Account) => {
  // Load contracts' codes
  const signer = await locklift.keystore.getSigner("0");
  const TokenRoot = locklift.factory.getContractArtifacts(
    "TokenRootUpgradeable",
  );
  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  console.log("Deploying TokenFactory...");

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenFactory",
        constructorParams: {
          _owner: account.address,
        },
        initParams: {
          randomNonce_: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(10),
      },
      deploymentName: "TokenFactory",
      enableLogs: true,
    }),
  );

  const tokenFactory =
    locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");

  console.log("[TokenFactory] setRootCode...");
  await tokenFactory.methods.setRootCode({ _rootCode: TokenRoot.code }).send({
    from: account.address,
    amount: toNano(2),
  });

  console.log("[TokenFactory] setWalletCode...");
  await tokenFactory.methods
    .setWalletCode({ _walletCode: TokenWallet.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log("[TokenFactory] setWalletPlatformCode...");
  await tokenFactory.methods
    .setWalletPlatformCode({ _walletPlatformCode: TokenWalletPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  // Log and save address
  console.log(`TokenFactory: ${tokenFactory.address}`);

  return tokenFactory;
};

/**
 * Deploys a new TokenRoot contract and creates a new TIP-3 token
 * @param account account to pay gas
 * @param name name of the token
 * @param symbol tag of the token
 * @param decimals token decimals
 * @return TokenRoot contract with address for interaction
 */
export const tokenMigration = async (
  account: Account,
  name: string,
  symbol: string,
  decimals = 18,
) => {
  // Load contracts' codes
  const signer = await locklift.keystore.getSigner("0");
  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  console.log("Deploying TokenRoot...");
  const token = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenRootUpgradeable",
        publicKey: signer.publicKey,
        initParams: {
          randomNonce_: locklift.utils.getRandomNonce(),
          deployer_: zeroAddress,
          name_: name,
          symbol_: symbol,
          decimals_: decimals,
          walletCode_: TokenWallet.code,
          rootOwner_: account.address,
          platformCode_: TokenWalletPlatform.code,
        },
        constructorParams: {
          initialSupplyTo: zeroAddress,
          initialSupply: "0",
          deployWalletValue: "0",
          mintDisabled: false,
          burnByRootDisabled: true,
          burnPaused: true,
          remainingGasTo: zeroAddress,
        },
        value: toNano(10),
      },
      deploymentName: `TokenRoot${symbol}`,
      enableLogs: true,
    }),
  );

  // Log and save address
  console.log(`TokenRoot${symbol}: ${token.extTransaction.contract.address}`);

  return token.extTransaction.contract.address;
};

/**
 * Deploys a new DexRoot contract
 * @param account account to pay gas
 * @param prev previous or current contract's version
 * @return DexRoot contract with address for interaction
 */
export const dexRootMigration = async (account: Account, prev = false) => {
  // Load contracts' codes
  const signer = await locklift.keystore.getSigner("0");
  // const DexRoot = locklift.factory.getContractArtifacts(
  //   prev ? "DexRootPrev" : "DexRoot",
  // );
  const DexPair = locklift.factory.getContractArtifacts(
    prev ? "TestNewDexPair" : "DexPair",
  );
  const DexStablePair = locklift.factory.getContractArtifacts("DexStablePair");
  const DexAccount = locklift.factory.getContractArtifacts("DexAccount");
  const LpTokenPending =
    locklift.factory.getContractArtifacts("LpTokenPending");
  const tokenFactory =
    locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");

  const DexTokenVault = locklift.factory.getContractArtifacts("DexTokenVault");

  console.log("Deploying DexRoot...");
  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexRoot",
        constructorParams: {
          initial_owner: account.address,
          initial_vault: zeroAddress,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexRoot",
      enableLogs: true,
    }),
  );

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  console.log("Deploying DexVault...");
  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexVault",
        constructorParams: {
          owner_: account.address,
          token_factory_: tokenFactory.address,
          root_: dexRoot.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexVault",
      enableLogs: true,
    }),
  );

  const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

  console.log(`DexRoot: installing vault address...`);
  await dexRoot.methods.setVaultOnce({ new_vault: dexVault.address }).send({
    from: account.address,
    amount: toNano(2),
  });

  console.log("DexRoot: installing vault code...");
  await dexRoot.methods
    .installOrUpdateTokenVaultCode({
      _newCode: DexTokenVault.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log("DexRoot: installing lp pending code...");
  await dexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: LpTokenPending.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log(`DexRoot: installing vault address...`);
  await dexRoot.methods.setVaultOnce({ new_vault: dexVault.address }).send({
    from: account.address,
    amount: toNano(2),
  });

  console.log("DexRoot: set Token Factory...");
  await dexRoot.methods
    .setTokenFactory({
      _newTokenFactory: tokenFactory.address,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log("[DexRoot] installOrUpdateAccountCode...");
  await dexRoot.methods
    .installOrUpdateAccountCode({ code: DexAccount.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log("[DexRoot] installOrUpdatePairCode...");
  await dexRoot.methods
    .installOrUpdatePairCode({ code: DexPair.code, pool_type: 1 })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);
  await dexRoot.methods
    .installOrUpdatePairCode({ code: DexStablePair.code, pool_type: 2 })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  // Log and save address
  console.log(`DexRoot: ${dexRoot.address}`);

  return dexRoot;
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
export const dexPairMigration = async (
  account: Account,
  dexRoot: Contract<DexRootAbi>,
  leftTokenSymbol: string,
  leftTokenRoot: Address,
  rightTokenSymbol: string,
  rightTokenRoot: Address,
  prev = false,
) => {
  // Load contract's code
  // const DexPair = locklift.factory.getContractArtifacts(
  //   prev ? "DexPairPrev" : "DexPair",
  // );

  console.log("[DexRoot] deployPair...", prev);
  await dexRoot.methods
    .deployPair({
      left_root: leftTokenRoot,
      right_root: rightTokenRoot,
      send_gas_to: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(10),
    });

  console.log("[DexRoot] getExpectedPairAddress...");
  await dexRoot.methods
    .deployPair({
      left_root: leftTokenRoot,
      right_root: rightTokenRoot,
      send_gas_to: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(10),
    });

  const address = await dexRoot.methods
    .getExpectedPairAddress({
      left_root: leftTokenRoot,
      right_root: rightTokenRoot,
      answerId: 0,
    })
    .call();

  await locklift.deployments.saveContract({
    contractName: "DexPair",
    deploymentName: `DexPair${leftTokenSymbol}${rightTokenSymbol}`,
    address: address.value0,
  });
  // Log and save address
  console.log(
    `DexPair${leftTokenSymbol}${rightTokenSymbol}: ${address.value0}`,
  );

  // prev ? "DexPairPrev" : "DexPair",
  const DexPair = locklift.factory.getDeployedContract(
    "DexPair",
    address.value0,
  );

  return DexPair;
};

/**
 * Deploys TokenRoot contracts for specified tokens
 * @param account account to pay gas
 * @param tokens tokens' data for creation
 * @return TIP-3 tokens' roots
 */
export const createTokens = async (account: Account, tokens: ITokenRoot[]) => {
  const roots: Record<string, Address> = {};

  for (const token of tokens) {
    roots[token.symbol] = await tokenMigration(
      account,
      token.name,
      token.symbol,
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
export const createPairs = async (
  account: Account,
  dexRoot: Contract<DexRootAbi>,
  roots: Record<string, Address>,
  pairs: Record<"left" | "right", string>[],
  prev = false,
) => {
  const dexPairs: Record<string, Contract<DexPairAbi>> = {};

  for (const pair of pairs) {
    dexPairs[`${pair.left}${pair.right}`] = await dexPairMigration(
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
export const createDex = async (
  account: Account,
  tokens: ITokenRoot[],
  pairs: Record<"left" | "right", string>[],
  prev = false,
) => {
  // Deploy TIP-3 tokens
  await tokenFactoryMigration(account);
  const roots = await createTokens(account, tokens);

  // Deploy Root, Vault and pairs
  const dexRoot = await dexRootMigration(account, prev);
  const dexPairs = await createPairs(account, dexRoot, roots, pairs, prev);

  return [dexRoot, roots, dexPairs];
};
