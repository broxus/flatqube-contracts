import { toNano, zeroAddress } from "locklift";
import { Constants, displayTx } from "../../v2/utils/migration";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";
import { TOKENS_N, TOKENS_DECIMALS } from "../../utils/consts";
import { DEX_STABLE_POOL_LP } from "./08-deploy-dex-stable-pool";
import { IFee } from "../../utils/wrappers";

const SECOND = "token-9-1";

export default async () => {
  console.log("10-deploy-dex-pairs.js");
  await locklift.deployments.load();

  const dexOwner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  // const commonAcc = locklift.deployments.getAccount("commonAccount-0").account;

  const feeParams = {
    denominator: 1000000,
    pool_numerator: 3000,
    beneficiary_numerator: 7000,
    referrer_numerator: 0,
    beneficiary: zeroAddress, // or commonAcc.address
    threshold: [],
    referrer_threshold: [],
  } as IFee;

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
            send_gas_to: dexOwner.address,
          })
          .send({
            from: dexOwner.address,
            amount: toNano(15),
          }),
      );

      displayTx(tx.extTransaction, "deploy pair");

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

      await dexRoot.methods
        .setPairFeeParams({
          _roots: [tokenFoo.address, tokenBar.address],
          _params: feeParams,
          _remainingGasTo: dexOwner.address,
        })
        .send({
          from: dexOwner.address,
          amount: toNano(1.5),
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

  Array.from({ length: TOKENS_N }).map(async (_, iLeft) => {
    Array.from({ length: TOKENS_N }).map(async (_, iRight) => {
      TOKENS_DECIMALS.map(async decimals => {
        if (iLeft === iRight) return;
        if (iLeft > iRight) return;
        allPairs.push([
          `token-${decimals}-${iLeft}`,
          `token-${decimals}-${iRight}`,
        ]);
      });
    });
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
  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployPair({
        left_root: lpToken.address,
        right_root: tokenBar.address,
        send_gas_to: dexOwner.address,
      })
      .send({
        from: dexOwner.address,
        amount: toNano(15),
      }),
  );

  const dexPairFooBarAddress = await dexRoot.methods
    .getExpectedPairAddress({
      answerId: 0,
      left_root: lpToken.address,
      right_root: tokenBar.address,
    })
    .call()
    .then(r => r.value0);

  console.log(
    `DexPair_${DEX_STABLE_POOL_LP}_${SECOND} deployed: ${dexPairFooBarAddress}`,
  );

  const dexPairFooBar = locklift.factory.getDeployedContract(
    "DexPair",
    dexPairFooBarAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexPair",
    deploymentName: `DexPair_${DEX_STABLE_POOL_LP}_${SECOND}`,
    address: dexPairFooBarAddress,
  });

  const version = (
    await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
  ).version;
  console.log(`DexPair_${DEX_STABLE_POOL_LP}_${SECOND} version = ${version}`);

  const active = (await dexPairFooBar.methods.isActive({ answerId: 0 }).call())
    .value0;
  console.log(`DexPair_${DEX_STABLE_POOL_LP}_${SECOND} active = ${active}`);
  console.log("10-deploy-dex-pairs.js END");
};

export const tag = "dex-pairs";

export const dependencies = [
  "owner-account",
  "tokens",
  "dex-root",
  "dex-stable",
];
