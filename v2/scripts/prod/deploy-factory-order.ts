import { toNano, getRandomNonce } from "locklift";
import { isValidEverAddress } from "utils/helpers";
import prompts from "prompts";

async function main() {
  const response = await prompts([
    {
      type: "text",
      name: "owner",
      message: "OrderFactory owner",
      validate: (value: any) =>
        isValidEverAddress(value) || value === ""
          ? true
          : "Invalid Everscale address",
    },
    {
      type: "text",
      name: "dexRoot",
      message: "OrderFactory DexRoot",
      validate: (value: any) =>
        isValidEverAddress(value) || value === ""
          ? true
          : "Invalid Everscale address",
    },
  ]);

  const signer = await locklift.keystore.getSigner("0");
  const account = locklift.deployments.getAccount("Account1").account;

  const PlatformRootOrder =
    locklift.factory.getContractArtifacts("OrderRootPlatform");
  const PlatformOrder = locklift.factory.getContractArtifacts("OrderPlatform");
  const RootOrder = locklift.factory.getContractArtifacts("OrderRoot");
  const Order = locklift.factory.getContractArtifacts("Order");

  const {
    extTransaction: { contract: factoryOrder },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "OrderFactory",
        constructorParams: {
          _owner: account.address,
          _version: 1,
        },
        initParams: {
          randomNonce: getRandomNonce(),
          dexRoot: response.dexRoot,
        },
        publicKey: signer.publicKey,
        value: toNano(5),
      },
      deploymentName: "OrderFactory",
    }),
  );

  console.log(`Order Factory address: ${factoryOrder.address}`);

  console.log(`Set code OrderRootPlatform`);
  await factoryOrder.methods
    .setPlatformRootOrderCodeOnce({
      _orderRootPlatform: PlatformRootOrder.code,
    })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  console.log(`Set code OrderPlatform`);
  await factoryOrder.methods
    .setPlatformOrderCodeOnce({ _orderPlatform: PlatformOrder.code })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  console.log(`Set code OrderRoot`);
  await factoryOrder.methods
    .setOrderRootCode({ _orderRootCode: RootOrder.code })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  console.log(`Set code Order`);
  await factoryOrder.methods.setOrderCode({ _orderCode: Order.code }).send({
    from: account.address,
    amount: toNano(0.1),
  });

  console.log(`Set FeeParams`);
  await factoryOrder.methods
    .setFeeParams({
      params: {
        numerator: 3,
        denominator: 1000,
        matchingNumerator: 500,
        matchingDenominator: 1000,
        beneficiary: factoryOrder.address,
      },
    })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });

  console.log(`Set newOwner`);
  await factoryOrder.methods
    .transferOwner({ answerId: 0, newOwner: response.owner })
    .send({
      from: account.address,
      amount: toNano(0.1),
    });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
