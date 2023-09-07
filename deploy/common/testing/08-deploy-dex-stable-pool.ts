import { TokenRootUpgradeableAbi } from "../../../build/factorySource";
import { getThresholdForAllTokens, IFee } from "../../../utils/wrappers";
import { createDexPair, createStablePool } from "../../../utils/deploy.utils";
import { upgradePair } from "../../../utils/upgrade.utils";

const FIRST = "token-6-0";
const SECOND = "token-9-0";
const THIRD = "token-18-0";
export const DEX_STABLE_POOL_LP = "DexStablePool_lp";

export default async () => {
  const commonAcc = locklift.deployments.getAccount("commonAccount-0").account;

  const feeParams = {
    denominator: 1000000,
    pool_numerator: 1000,
    beneficiary_numerator: 2000,
    referrer_numerator: 3000,
    beneficiary: commonAcc.address,
    threshold: getThresholdForAllTokens(),
    referrer_threshold: [],
  } as IFee;

  const tokenFirst =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(FIRST);
  const tokenSecond =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(SECOND);
  const tokenThird =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(THIRD);

  const rootsTriple = [
    tokenFirst.address,
    tokenSecond.address,
    tokenThird.address,
  ];

  // deploying first stable pair
  const dexStablePairFirst = await createDexPair(
    tokenFirst.address,
    tokenSecond.address,
    feeParams,
  );
  await upgradePair(
    tokenFirst.address,
    tokenSecond.address,
    locklift.factory.getContractArtifacts("DexStablePair"),
    2,
  );

  console.log(
    `DexStablePair_${FIRST}_${SECOND} address = ${dexStablePairFirst}`,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePair",
    deploymentName: `DexStablePair_${FIRST}_${SECOND}`,
    address: dexStablePairFirst,
  });

  // deploying second stable pair
  const dexStablePairSecond = await createDexPair(
    tokenSecond.address,
    tokenThird.address,
    feeParams,
  );
  await upgradePair(
    tokenSecond.address,
    tokenThird.address,
    locklift.factory.getContractArtifacts("DexStablePair"),
    2,
  );

  console.log(
    `DexStablePair_${SECOND}_${THIRD} address = ${dexStablePairSecond}`,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePair",
    deploymentName: `DexStablePair_${SECOND}_${THIRD}`,
    address: dexStablePairSecond,
  });

  // deploying 3 tokens stable pool

  const dexStablePoolAddress = await createStablePool(rootsTriple, feeParams);
  console.log(
    `DexStablePool_${FIRST}_${SECOND}_${THIRD} address = ${dexStablePoolAddress}`,
  );

  const DexStablePool = locklift.factory.getDeployedContract(
    "DexStablePool",
    dexStablePoolAddress,
  );

  const tokenRoots = await DexStablePool.methods
    .getTokenRoots({ answerId: 0 })
    .call();

  await locklift.deployments.saveContract({
    contractName: "TokenRootUpgradeable",
    deploymentName: DEX_STABLE_POOL_LP,
    address: tokenRoots.lp,
  });
  console.log("StablePoolLpToken address: ", tokenRoots.lp.toString());

  await locklift.deployments.saveContract({
    contractName: "DexStablePool",
    deploymentName: `DexStablePool_${FIRST}_${SECOND}_${THIRD}`,
    address: DexStablePool.address,
  });

  const version = (
    await DexStablePool.methods.getVersion({ answerId: 0 }).call()
  ).version;
  console.log(`DexPool version = ${version}`);

  const active = (await DexStablePool.methods.isActive({ answerId: 0 }).call())
    .value0;
  console.log(`DexPool active = ${active}`);
};

export const tag = "dex-stable";

export const dependencies = [
  "owner-account",
  "common-accounts",
  "dex-root",
  "tokens",
];
