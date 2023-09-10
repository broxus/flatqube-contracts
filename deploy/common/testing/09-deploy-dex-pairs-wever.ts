import { TokenRootUpgradeableAbi } from "../../../build/factorySource";
import { TOKENS_N } from "../../../utils/consts";
import { createDexPair } from "../../../utils/deploy.utils";

const TOKEN_DECIMAL = 6;

export default async () => {
  const wEverOwner = locklift.deployments.getAccount("DexOwner").account;

  locklift.tracing.setAllowedCodesForAddress(wEverOwner.address, {
    compute: [100],
  });

  const deployDexPairFunc = async (lToken = "foo", rToken = "bar") => {
    const pairs = [[lToken, rToken]];

    for (const p of pairs) {
      const pair = { left: p[0], right: p[1] };

      console.log(`Start deploy pair DexPair_${pair.left}_${pair.right}`);

      const tokenFoo =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.left);
      const tokenBar =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.right);

      // deploying real PAIR
      const { address: dexPairFooBarAddress } = await createDexPair(
        tokenFoo.address,
        tokenBar.address,
      );

      console.log(
        `DexPair_${pair.left}_${pair.right}: ${dexPairFooBarAddress}`,
      );

      const dexPairFooBar = locklift.factory.getDeployedContract(
        "DexPair",
        dexPairFooBarAddress,
      );

      await locklift.deployments.saveContract({
        contractName: "DexPair",
        deploymentName: `DexPair_${pair.left}_${pair.right}`,
        address: dexPairFooBarAddress,
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

  console.log("deploying wever pairs");
  // creating 2 pairs of tokens with wever
  const allWeverPairs: [string, string][] = [];

  Array.from({ length: TOKENS_N }).map(async (_, iRight) => {
    allWeverPairs.push([`token-wever`, `token-${TOKEN_DECIMAL}-${iRight}`]);
  });

  for (let i = 0; i < allWeverPairs.length; i++) {
    // await deployDexPairFunc(`token-0`, `token-2`);
    await deployDexPairFunc(allWeverPairs[i][0], allWeverPairs[i][1]);
  }
};

export const tag = "dex-pairs-wever";

export const dependencies = [
  "owner-account",
  "token-factory",
  "tokens",
  "dex-root",
];
