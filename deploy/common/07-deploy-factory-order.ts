import { toNano, getRandomNonce } from "locklift";
import { DexRootAbi } from "../../build/factorySource";

export default async () => {
  const owner = locklift.deployments.getAccount("DexOwner");
  const account = owner.account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const PlatformRootOrder =
    locklift.factory.getContractArtifacts("OrderRootPlatform");
  const PlatformOrder = locklift.factory.getContractArtifacts("OrderPlatform");
  const RootOrder = locklift.factory.getContractArtifacts("OrderRoot");
  const Order = locklift.factory.getContractArtifacts("Order");

  const { extTransaction: factoryOrder } =
    await locklift.transactions.waitFinalized(
      await locklift.deployments.deploy({
        deployConfig: {
          contract: "OrderFactory",
          constructorParams: {
            _owner: account.address,
            _version: 1,
          },
          initParams: {
            randomNonce: getRandomNonce(),
            dexRoot: dexRoot.address,
          },
          publicKey: owner.signer.publicKey,
          value: toNano(5),
        },
        deploymentName: "OrderFactory",
        enableLogs: true,
      }),
    );

  await factoryOrder.contract.methods
    .setPlatformRootOrderCodeOnce({
      _orderRootPlatform: PlatformRootOrder.code,
    })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  await factoryOrder.contract.methods
    .setPlatformOrderCodeOnce({ _orderPlatform: PlatformOrder.code })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  await factoryOrder.contract.methods
    .setOrderRootCode({ _orderRootCode: RootOrder.code })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  await factoryOrder.contract.methods
    .setOrderCode({ _orderCode: Order.code })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  await factoryOrder.contract.methods
    .setFeeParams({
      params: {
        numerator: 3,
        denominator: 1000,
        matchingNumerator: 500,
        matchingDenominator: 1000,
        beneficiary: factoryOrder.contract.address,
      },
    })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  // console.log(`Set newOwner`);
  // await factoryOrder.contract.methods
  //   .transferOwner({ answerId: 0, newOwner: account.address })
  //   .send({
  //     from: account.address,
  //     amount: toNano(0.1),
  //   });
};

export const tag = "factory-order";

export const dependencies = ["owner-account", "dex-root"];
