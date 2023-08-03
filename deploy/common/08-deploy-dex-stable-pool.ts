import { toNano } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";
import { displayTx } from "../../v2/utils/migration";

const FIRST = "token-6-0";
const SECOND = "token-9-0";
const THIRD = "token-18-0";

export default async () => {
  const account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const tokenFirst =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(FIRST);
  const tokenSecond =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(SECOND);
  const tokenThird =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(THIRD);

  const { extTransaction: dataDeploy } =
    await locklift.transactions.waitFinalized(
      await dexRoot.methods
        .deployStablePool({
          roots: [tokenFirst.address, tokenSecond.address, tokenThird.address],
          send_gas_to: account.address,
        })
        .send({
          from: account.address,
          amount: toNano(20),
        }),
    );

  displayTx(dataDeploy);

  const dexPoolAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: [tokenFirst.address, tokenSecond.address, tokenThird.address],
      })
      .call()
  ).value0;

  console.log(`Start deploy pool DexStablePool`);

  console.log(`DexPool address = ${dexPoolAddress}`);

  const DexPool = locklift.factory.getDeployedContract(
    "DexStablePool",
    dexPoolAddress,
  );

  await locklift.deployments.saveContract({
    contractName: "DexStablePool",
    deploymentName: `DexStablePool_${tokenFirst}_${tokenSecond}_${tokenThird}`,
    address: DexPool.address,
  });

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
