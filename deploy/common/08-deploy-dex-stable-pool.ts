import { Address, toNano } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";

const FIRST = "token-6-0";
const SECOND = "token-9-0";
const THIRD = "token-18-0";
export const DEX_STABLE_POOL_LP = "DexStablePool_lp";

export interface IFee {
  denominator: number;
  pool_numerator: number;
  beneficiary_numerator: number;
  referrer_numerator: number;
  beneficiary: Address;
  threshold: [Address, string | number][];
  referrer_threshold: [Address, string | number][];
}

export default async () => {
  const account = locklift.deployments.getAccount("DexOwner").account;
  const commonAcc = locklift.deployments.getAccount("commonAccount-0").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

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

  // deploying stable pair
  console.log(`Start deploy DexStablePair`);
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

  const dexStablePairAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: [tokenFirst.address, tokenSecond.address],
      })
      .call()
  ).value0;

  console.log(`Dex_Stable_Pair address = ${dexStablePairAddress}`);

  const DexStablePair = locklift.factory.getDeployedContract(
    "DexStablePair",
    dexStablePairAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePair",
    deploymentName: `DexStablePair_${FIRST}_${SECOND}`,
    address: DexStablePair.address,
  });

  // deploying 3 tokens stable pool
  console.log(`Start deploy DexStablePool`);
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
  console.log(tokenRoots.lp, "lpToken");

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
    threshold: [],
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

  console.log(`SetPairFeeParams done for DexStablePair and DexStablePool`);

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
