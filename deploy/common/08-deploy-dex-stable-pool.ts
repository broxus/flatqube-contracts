import { toNano } from "locklift";
import { DexRootAbi, TokenRootUpgradeableAbi } from "../../build/factorySource";
import { displayTx } from "../../v2/utils/migration";

const LEFT = "token-6-0";
const RIGHT = "token-6-1";

export default async () => {
  const account = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const tokenRootLeft =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(LEFT);
  const tokenRootRight =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(RIGHT);

  const { extTransaction: dataDeploy } =
    await locklift.transactions.waitFinalized(
      await dexRoot.methods
        .deployStablePool({
          roots: [tokenRootLeft.address, tokenRootRight.address],
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
        _roots: [tokenRootLeft.address, tokenRootRight.address],
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
    deploymentName: `DexStablePool_${LEFT}_${RIGHT}`,
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
