import { toNano } from "locklift";
import { Constants, displayTx } from "../../../v2/utils/migration";
import {
  DexRootAbi,
  TokenRootUpgradeableAbi,
} from "../../../build/factorySource";
import { TOKENS_N } from "../../../utils/consts";

const TOKEN_DECIMAL = 6;

export default async () => {
  console.log("09-deploy-wever-dex-pairs.js");
  await locklift.deployments.load();

  const wEverOwner = locklift.deployments.getAccount("DexOwner").account;

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  locklift.tracing.setAllowedCodesForAddress(wEverOwner.address, {
    compute: [100],
  });

  const deployDexPairFunc = async (lToken = "foo", rToken = "bar") => {
    const pairs = [[lToken, rToken]];
    await locklift.deployments.load();

    for (const p of pairs) {
      const tokenLeft = {
        name: p[0],
        symbol: p[0],
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      };
      const tokenRight = {
        name: [p[1]],
        symbol: p[1],
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      };

      const pair = { left: tokenLeft.symbol, right: tokenRight.symbol };

      console.log(`Start deploy pair DexPair_${pair.left}_${pair.right}`);

      const tokenFoo =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.left);
      const tokenBar =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.right);

      // deploying real PAIR
      const tx = await locklift.transactions.waitFinalized(
        dexRoot.methods
          .deployPair({
            left_root: tokenFoo.address,
            right_root: tokenBar.address,
            send_gas_to: wEverOwner.address,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(15),
          }),
      );

      displayTx(tx.extTransaction);

      const dexPairFooBarAddress = await dexRoot.methods
        .getExpectedPairAddress({
          answerId: 0,
          left_root: tokenFoo.address,
          right_root: tokenBar.address,
        })
        .call()
        .then(r => r.value0);

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

      console.log("09-deploy-wever-dex-pairs.js END");
    }
  };

  console.log("deploying wever pairs");
  // creating 2 pairs of tokens with wever
  const allWeverPairs: [string, string][] = [];

  Array.from({ length: TOKENS_N }).map(async (_, iRight) => {
    allWeverPairs.push([`wever`, `token-${TOKEN_DECIMAL}-${iRight}`]);
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
