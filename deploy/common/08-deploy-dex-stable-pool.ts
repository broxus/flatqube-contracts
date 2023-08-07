import { Address, toNano } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";

export const FIRST = "token-6-0";
export const SECOND = "token-9-0";
const THIRD = "token-18-0";

interface IFee {
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

  // deploying 2 tokens pool
  console.log(`Start deploy DOUBLE pool DexStablePool`);
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

  const dexPoolAddressDouble = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: [tokenFirst.address, tokenSecond.address],
      })
      .call()
  ).value0;

  console.log(`DexDOUBLE_Pool address = ${dexPoolAddressDouble}`);

  const DexPoolDouble = locklift.factory.getDeployedContract(
    "DexStablePool",
    dexPoolAddressDouble,
  );

  const lpToken = await DexPoolDouble.methods
    .getTokenRoots({ answerId: 0 })
    .call();

  console.log(lpToken, "lpToken");

  await locklift.deployments.saveContract({
    contractName: "DexStablePool",
    deploymentName: `DexStablePool_${FIRST}_${SECOND}`,
    address: DexPoolDouble.address,
  });

  // deploying 3 tokens pool
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

  const dexPoolAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: rootsTriple,
      })
      .call()
  ).value0;

  console.log(`Start deploy TRIPLE pool DexStablePool`);

  console.log(`DexTRIPLE_Pool address = ${dexPoolAddress}`);

  const DexPool = locklift.factory.getDeployedContract(
    "DexStablePool",
    dexPoolAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePool",
    deploymentName: `DexStablePool_${FIRST}_${SECOND}_${THIRD}`,
    address: DexPool.address,
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

  console.log(`SetPairFeeParams done for Double and Triple pool`);

  const version = (await DexPool.methods.getVersion({ answerId: 0 }).call())
    .version;
  console.log(`DexPool version = ${version}`);

  // await new Promise(resolve => setTimeout(resolve, 10000));

  const active = (await DexPool.methods.isActive({ answerId: 0 }).call())
    .value0;
  console.log(`DexPool active = ${active}`);
};

export const tag = "dex-stable";

export const dependencies = ["owner-account", "dex-root", "tokens"];
