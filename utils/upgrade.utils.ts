import { Account } from "everscale-standalone-client";
import { Address, Contract, toNano } from "locklift";
import {
  DexAccountAbi,
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  DexTokenVaultAbi,
  DexVaultAbi,
  TestNewDexAccountAbi,
  TestNewDexPairAbi,
  TestNewDexRootAbi,
  TestNewDexStablePairAbi,
  TestNewDexTokenVaultAbi,
  TestNewDexVaultAbi,
} from "../build/factorySource";
import { ContractData } from "locklift/internal/factory";

export const installPairCode = async (
  newPair:
    | ContractData<DexPairAbi>
    | ContractData<TestNewDexPairAbi>
    | ContractData<DexStablePairAbi>
    | ContractData<TestNewDexStablePairAbi>,
  poolType = 1,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  return await dexRoot.methods
    .installOrUpdatePairCode({ code: newPair.code, pool_type: poolType })
    .send({
      from: owner.address,
      amount: toNano(3),
    });
};

/**
 * Upgrades DEX pair's code
 * @param leftRoot TokenRoot contract of the left pair's token with address
 * @param rightRoot TokenRoot contract of the right pair's token with address
 * @param newPair a new DexPair contract
 * @param poolType a new contract's type
 * @param updateCode update pair code or not
 */
export const upgradePair = async (
  leftRoot: Address,
  rightRoot: Address,
  newPair:
    | ContractData<DexPairAbi>
    | ContractData<TestNewDexPairAbi>
    | ContractData<DexStablePairAbi>
    | ContractData<TestNewDexStablePairAbi>,
  poolType = 1,
  updateCode: boolean = true,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  if (updateCode) {
    await installPairCode(newPair, poolType);
  }

  return await dexRoot.methods
    .upgradePair({
      left_root: leftRoot,
      right_root: rightRoot,
      send_gas_to: owner.address,
      pool_type: poolType,
    })
    .send({
      from: owner.address,
      amount: toNano(10),
    });
};

export const installPoolCode = async (
  newPool: ContractData<DexStablePoolAbi>,
  poolType = 3,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  return await dexRoot.methods
    .installOrUpdatePoolCode({ code: newPool.code, pool_type: poolType })
    .send({
      from: owner.address,
      amount: toNano(3),
    });
};

/**
 * Upgrades DEX pair's code
 * @param roots TokenRoots addresses
 * @param newPool a new DexPool contract
 * @param poolType a new contract's type
 * @param updateCode update pool code or not
 */
export const upgradePool = async (
  roots: Address[],
  newPool: ContractData<DexStablePoolAbi>,
  poolType = 3,
  updateCode: boolean = true,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  if (updateCode) {
    await installPoolCode(newPool, poolType);
  }

  return await dexRoot.methods
    .upgradePool({
      roots: roots,
      send_gas_to: owner.address,
      pool_type: poolType,
    })
    .send({
      from: owner.address,
      amount: toNano(10),
    });
};

export const installAccountCode = async (
  newAccount: ContractData<DexAccountAbi> | ContractData<TestNewDexAccountAbi>,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  return await dexRoot.methods
    .installOrUpdateAccountCode({ code: newAccount.code })
    .send({
      from: owner.address,
      amount: toNano(3),
    });
};

/**
 * Upgrades DEX account's code
 * @param user dexAccount's owner
 * @param dexAccount dexAccount
 * @param newAccount new DexAccount contract data
 * @param updateCode update DexAccount code or not
 */
export const upgradeAccount = async (
  user: Account,
  dexAccount: Contract<DexAccountAbi>,
  newAccount: ContractData<DexAccountAbi> | ContractData<TestNewDexAccountAbi>,
  updateCode: boolean = true,
) => {
  if (updateCode) {
    await installAccountCode(newAccount);
  }

  return await dexAccount.methods
    .requestUpgrade({ send_gas_to: user.address })
    .send({
      from: user.address,
      amount: toNano(6),
    });
};

/**
 * Force upgrades DEX account's code
 * @param user dexAccount's owner address
 * @param newAccount new DexAccount contract data
 * @param updateCode update DexAccount code or not
 */
export const forceUpgradeAccount = async (
  user: Address,
  newAccount: ContractData<DexAccountAbi> | ContractData<TestNewDexAccountAbi>,
  updateCode: boolean = true,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  if (updateCode) {
    await installAccountCode(newAccount);
  }

  return await dexRoot.methods
    .forceUpgradeAccount({ account_owner: user, send_gas_to: owner.address })
    .send({
      from: owner.address,
      amount: toNano(6),
    });
};

export const installTokenVaultCode = async (
  newTokenVault:
    | ContractData<DexTokenVaultAbi>
    | ContractData<TestNewDexTokenVaultAbi>,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  return await dexRoot.methods
    .installOrUpdateTokenVaultCode({
      _newCode: newTokenVault.code,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(3),
    });
};

/**
 * Upgrades DEX tokenVault's code
 * @param token tokenVault's token address
 * @param newTokenVault new DexTokenVault contract data
 * @param updateCode update DexTokenVault code or not
 */
export const upgradeTokenVault = async (
  token: Address,
  newTokenVault:
    | ContractData<DexTokenVaultAbi>
    | ContractData<TestNewDexTokenVaultAbi>,
  updateCode: boolean = true,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  if (updateCode) {
    await installTokenVaultCode(newTokenVault);
  }

  return await dexRoot.methods
    .upgradeTokenVault({ _tokenRoot: token, _remainingGasTo: owner.address })
    .send({
      from: owner.address,
      amount: toNano(6),
    });
};

/**
 * Upgrades DEX root's code
 * @param dexRoot DexRoot contract with address
 * @param newRoot a new DexRoot contract
 */
export const upgradeRoot = async (
  dexRoot: Contract<DexRootAbi>,
  newRoot: ContractData<DexRootAbi> | ContractData<TestNewDexRootAbi>,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;

  const { extTransaction: tx } = await locklift.transactions.waitFinalized(
    dexRoot.methods.upgrade({ code: newRoot.code }).send({
      from: owner.address,
      amount: toNano(11),
    }),
  );
  return tx;
};

/**
 * Upgrades DEX vault's code
 * @param dexVault DexVault contract with address
 * @param newVault a new DexVault contract
 */
export const upgradeVault = async (
  dexVault: Contract<DexVaultAbi>,
  newVault: ContractData<DexVaultAbi> | ContractData<TestNewDexVaultAbi>,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;

  const { extTransaction: tx } = await locklift.transactions.waitFinalized(
    dexVault.methods.upgrade({ code: newVault.code }).send({
      from: owner.address,
      amount: toNano(6),
    }),
  );
  return tx;
};
