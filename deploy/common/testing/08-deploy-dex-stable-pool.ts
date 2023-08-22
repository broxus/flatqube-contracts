import { toNano, zeroAddress } from "locklift";
import {
  DexRootAbi,
  TokenRootUpgradeableAbi,
} from "../../../build/factorySource";
import { getThresholdForAllTokens, IFee } from "../../../utils/wrappers";

const FIRST = "token-6-0";
const SECOND = "token-9-0";
const THIRD = "token-18-0";
export const DEX_STABLE_POOL_LP = "DexStablePool_lp";

export default async () => {
  const account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const commonAcc = locklift.deployments.getAccount("commonAccount-0").account;

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
  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployPair({
        left_root: tokenFirst.address,
        right_root: tokenSecond.address,
        send_gas_to: account.address,
      })
      .send({
        from: account.address,
        amount: toNano(15),
      }),
  );

  await locklift.transactions.waitFinalized(
    await dexRoot.methods
      .upgradePair({
        left_root: tokenFirst.address,
        right_root: tokenSecond.address,
        pool_type: 2,
        send_gas_to: account.address,
      })
      .send({
        from: account.address,
        amount: toNano(6),
      }),
  );

  const dexStablePairAddressFirst = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: [tokenFirst.address, tokenSecond.address],
      })
      .call()
  ).value0;

  console.log(
    `Dex_Stable_Pair_${FIRST}_${SECOND} address = ${dexStablePairAddressFirst}`,
  );

  const DexStablePairFirst = locklift.factory.getDeployedContract(
    "DexStablePair",
    dexStablePairAddressFirst,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePair",
    deploymentName: `DexStablePair_${FIRST}_${SECOND}`,
    address: DexStablePairFirst.address,
  });

  // deploying second stable pair
  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployPair({
        left_root: tokenSecond.address,
        right_root: tokenThird.address,
        send_gas_to: account.address,
      })
      .send({
        from: account.address,
        amount: toNano(15),
      }),
  );

  await locklift.transactions.waitFinalized(
    await dexRoot.methods
      .upgradePair({
        left_root: tokenSecond.address,
        right_root: tokenThird.address,
        pool_type: 2,
        send_gas_to: account.address,
      })
      .send({
        from: account.address,
        amount: toNano(6),
      }),
  );

  const dexStablePairAddressSecond = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: [tokenSecond.address, tokenThird.address],
      })
      .call()
  ).value0;

  console.log(
    `Dex_Stable_Pair_${SECOND}_${THIRD} address = ${dexStablePairAddressSecond}`,
  );

  const DexStablePairSecond = locklift.factory.getDeployedContract(
    "DexStablePair",
    dexStablePairAddressSecond,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePair",
    deploymentName: `DexStablePair_${SECOND}_${THIRD}`,
    address: DexStablePairSecond.address,
  });

  // deploying 3 tokens stable pool
  await locklift.transactions.waitFinalized(
    await dexRoot.methods
      .deployStablePool({
        roots: rootsTriple,
        send_gas_to: account.address,
      })
      .send({
        from: account.address,
        amount: toNano(20),
      }),
  );

  const dexStablePoolAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: rootsTriple,
      })
      .call()
  ).value0;

  console.log(`Dex_Stable_Pool address = ${dexStablePoolAddress}`);

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

  console.log(
    `Stable pool deployed: DexStablePool_${FIRST}_${SECOND}_${THIRD}`,
  );

  const feeParams = {
    denominator: 1000000,
    pool_numerator: 3000,
    beneficiary_numerator: 7000,
    referrer_numerator: 0,
    beneficiary: commonAcc.address,
    threshold: getThresholdForAllTokens(),
    referrer_threshold: [],
  } as IFee;

  await dexRoot.methods
    .setPairFeeParams({
      _roots: rootsTriple,
      _params: feeParams,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(1.5),
    });

  await dexRoot.methods
    .setPairFeeParams({
      _roots: [tokenFirst.address, tokenSecond.address],
      _params: feeParams,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(1.5),
    });

  await dexRoot.methods
    .setPairFeeParams({
      _roots: [tokenSecond.address, tokenThird.address],
      _params: feeParams,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(1.5),
    });

  const version = (
    await DexStablePool.methods.getVersion({ answerId: 0 }).call()
  ).version;
  console.log(`DexPool version = ${version}`);

  // await new Promise(resolve => setTimeout(resolve, 10000));

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
