import { Account } from "everscale-standalone-client";
import { Address, Contract, toNano } from "locklift";
import {
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  TestNewDexPairAbi,
  TestOracleDexPairAbi,
} from "../build/factorySource";
import { ContractData } from "locklift/internal/factory";

/**
 * Upgrades DEX pair's code
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param leftRoot TokenRoot contract of the left pair's token with address
 * @param rightRoot TokenRoot contract of the right pair's token with address
 * @param newPair a new DexPair contract
 * @param poolType a new contract's type
 */
export const upgradePair = async (
  account: Account,
  dexRoot: Contract<DexRootAbi>,
  leftRoot: Address,
  rightRoot: Address,
  newPair:
    | ContractData<DexPairAbi>
    | ContractData<TestOracleDexPairAbi>
    | ContractData<TestNewDexPairAbi>
    | ContractData<DexStablePairAbi>,
  poolType = 1,
) => {
  console.log("[DexRoot] installOrUpdatePairCode...");
  await dexRoot.methods
    .installOrUpdatePairCode({ code: newPair.code, pool_type: poolType })
    .send({
      from: account.address,
      amount: toNano(10),
    });

  console.log("[DexRoot] upgradePair...");
  const tx = await dexRoot.methods
    .upgradePair({
      left_root: leftRoot,
      right_root: rightRoot,
      send_gas_to: account.address,
      pool_type: poolType,
    })
    .send({
      from: account.address,
      amount: toNano(10),
    });

  console.log(`Pair is upgraded: ${tx.id}`);
};

/**
 * Upgrades DEX root's code
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param newRoot a new DexRoot contract
 */
export const upgradeRoot = async (
  account: Account,
  dexRoot: Contract<DexRootAbi>,
  newRoot: ContractData<DexRootAbi>,
) => {
  console.log("[DexRoot] upgrade...");
  const tx = await dexRoot.methods
    .upgrade({
      code: newRoot.code,
    })
    .send({
      from: account.address,
      amount: toNano(10),
    });
  console.log(`Root is upgraded: ${tx.id}`);
};
