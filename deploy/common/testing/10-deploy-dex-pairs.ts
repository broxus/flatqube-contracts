import { TokenRootUpgradeableAbi } from "../../../build/factorySource";
import { TOKENS_N, TOKENS_DECIMALS } from "../../../utils/consts";
import { DEX_STABLE_POOL_LP } from "./08-deploy-dex-stable-pool";
import { getThresholdForAllTokens, IFee } from "../../../utils/wrappers";
import { createDexPair } from "../../../utils/deploy.utils";

const SECOND = "token-9-1";

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

  const deployDexPairFunc = async (lToken = "foo", rToken = "bar") => {
    const pairs = [[lToken, rToken]];

    for (const p of pairs) {
      const pair = { left: p[0], right: p[1] };

      const tokenFoo =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.left);
      const tokenBar =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.right);

      // deploying real PAIR
      const { address: dexPairAddress } = await createDexPair(
        tokenFoo.address,
        tokenBar.address,
        feeParams,
      );

      console.log(`DexPair_${pair.left}_${pair.right}: ${dexPairAddress}`);

      const dexPairFooBar = locklift.factory.getDeployedContract(
        "DexPair",
        dexPairAddress,
      );

      await locklift.deployments.saveContract({
        contractName: "DexPair",
        deploymentName: `DexPair_${pair.left}_${pair.right}`,
        address: dexPairAddress,
      });

      const version = (
        await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
      ).version;
      console.log(`DexPair_${pair.left}_${pair.right} version = ${version}`);

      const active = (
        await dexPairFooBar.methods.isActive({ answerId: 0 }).call()
      ).value0;
      console.log(`DexPair_${pair.left}_${pair.right} active = ${active}`);
    }
  };

  // creating (TOKENS_N / 2) * TOKENS_DECIMALS.length pairs
  const allPairs: [string, string][] = [];

  Array.from({ length: TOKENS_N }).map((_, iLeft) => {
    Array.from({ length: TOKENS_N }).map((_, iRight) => {
      TOKENS_DECIMALS.forEach(decimals => {
        if (iLeft === iRight) return;
        if (iLeft > iRight) return;
        allPairs.push([
          `token-${decimals}-${iLeft}`,
          `token-${decimals}-${iRight}`,
        ]);
      });
    });
  });

  TOKENS_DECIMALS.forEach((decimals, i) => {
    if (i === 0) return;
    allPairs.push([`token-${TOKENS_DECIMALS[i - 1]}-1`, `token-${decimals}-1`]);
  });

  for (let i = 0; i < allPairs.length; i++) {
    // await deployDexPairFunc(`token-0`, `token-2`);
    await deployDexPairFunc(allPairs[i][0], allPairs[i][1]);
  }

  // deploy lp-token-1 pair
  const lpToken =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      DEX_STABLE_POOL_LP,
    );
  const tokenBar =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(SECOND);

  // deploying real PAIR
  const { address: dexPairAddress } = await createDexPair(
    lpToken.address,
    tokenBar.address,
    feeParams,
  );

  console.log(
    `DexPair_${DEX_STABLE_POOL_LP}_${SECOND} deployed: ${dexPairAddress}`,
  );

  const dexPairFooBar = locklift.factory.getDeployedContract(
    "DexPair",
    dexPairAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexPair",
    deploymentName: `DexPair_${DEX_STABLE_POOL_LP}_${SECOND}`,
    address: dexPairAddress,
  });

  const version = (
    await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
  ).version;
  console.log(`DexPair_${DEX_STABLE_POOL_LP}_${SECOND} version = ${version}`);

  const active = (await dexPairFooBar.methods.isActive({ answerId: 0 }).call())
    .value0;
  console.log(`DexPair_${DEX_STABLE_POOL_LP}_${SECOND} active = ${active}`);
};

export const tag = "dex-pairs";

export const dependencies = [
  "owner-account",
  "tokens",
  "dex-root",
  "dex-stable",
];
