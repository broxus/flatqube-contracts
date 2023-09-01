import { Account } from "everscale-standalone-client";
import { Address, Contract, toNano } from "locklift";
import {
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TestNewDexPairAbi,
  TestNewDexStablePairAbi,
} from "../build/factorySource";
import { ContractData } from "locklift/internal/factory";

/**
 * Upgrades DEX pair's code
 * @param leftRoot TokenRoot contract of the left pair's token with address
 * @param rightRoot TokenRoot contract of the right pair's token with address
 * @param newPair a new DexPair contract
 * @param poolType a new contract's type
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
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  await dexRoot.methods
    .installOrUpdatePairCode({ code: newPair.code, pool_type: poolType })
    .send({
      from: owner.address,
      amount: toNano(3),
    });

  const tx = await dexRoot.methods
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

  return tx;
};

/**
 * Upgrades DEX pair's code
 * @param roots TokenRoots addresses
 * @param newPool a new DexPool contract
 * @param poolType a new contract's type
 */
export const upgradePool = async (
  roots: Address[],
  newPool: ContractData<DexStablePoolAbi>,
  poolType = 3,
) => {
  const owner: Account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot: Contract<DexRootAbi> =
    locklift.deployments.getContract("DexRoot");

  await dexRoot.methods
    .installOrUpdatePoolCode({ code: newPool.code, pool_type: poolType })
    .send({
      from: owner.address,
      amount: toNano(3),
    });

  const tx = await dexRoot.methods
    .upgradePool({
      roots: roots,
      send_gas_to: owner.address,
      pool_type: poolType,
    })
    .send({
      from: owner.address,
      amount: toNano(10),
    });

  return tx;
};

// /**
//  * Upgrades DEX root's code
//  * @param account account to pay gas
//  * @param dexRoot DexRoot contract with address
//  * @param newRoot a new DexRoot contract
//  */
// export const upgradeRoot = async (
//   account: Account,
//   dexRoot: Contract<DexRootAbi>,
//   newRoot: ContractData<DexRootAbi>,
// ) => {
//   console.log("[DexRoot] upgrade...");
//   const tx = await dexRoot.methods
//     .upgrade({
//       code: newRoot.code,
//     })
//     .send({
//       from: account.address,
//       amount: toNano(10),
//     });
//   console.log(`Root is upgraded: ${tx.id}`);
// };
