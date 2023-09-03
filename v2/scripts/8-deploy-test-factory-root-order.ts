import { WalletTypes } from "locklift";
import { logMigrationProcess, logMigrationSuccess } from "../../utils/oldUtils";

const {
  getRandomNonce,
  Migration,
  TOKEN_CONTRACTS_PATH,
  Constants,
  afterRun,
} = require(process.cwd() + "/scripts/utils");
const migration = new Migration();

async function main() {
  const signer = await locklift.keystore.getSigner("0");
  const account = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.WalletV3,
    publicKey: signer!.publicKey,
  });
  const FactoryOrder = await locklift.factory.getContractArtifacts(
    "OrderFactory",
  );
  const RootOrder = await locklift.factory.getContractArtifacts("OrderRoot");
  const Order = await locklift.factory.getContractArtifacts("Order");
  const ClosedOrder = await locklift.factory.getContractArtifacts(
    "OrderClosed",
  );
  const PlatformOrder = await locklift.factory.getContractArtifacts(
    "OrderPlatform",
  );

  const dexRoot = await locklift.factory.getDeployedContract(
    "DexRoot",
    migration.getAddress("DexRoot"),
  );

  logMigrationProcess(
    "factoryOrder",
    "constructor",
    "Deploying factoryOrder...",
  );
  const factoryOrder = (
    await locklift.factory.deployContract({
      contract: "OrderFactory",
      publicKey: signer.publicKey,
      initParams: {
        randomNonce: getRandomNonce(),
        dexRoot: dexRoot.address,
      },
      constructorParams: {
        _owner: account.address,
        _version: 1,
      },
      value: locklift.utils.toNano(1.5),
    })
  ).contract;

  logMigrationSuccess(
    "factoryOrder",
    "constructor",
    `Deployed OrderFactory: ${factoryOrder.address}`,
  );
  logMigrationProcess(
    "factoryOrder",
    "setPlatformCodeOnce",
    "Set code OrderPlatform...",
  );
  await factoryOrder.methods
    .setPlatformCodeOnce({ _orderPlatform: PlatformOrder.code })
    .send({
      amount: locklift.utils.toNano(0.1),
      from: account.address,
    });

  logMigrationProcess(
    "factoryOrder",
    "setOrderRootCode",
    "Set code OrderRoot...",
  );
  await factoryOrder.methods
    .setOrderRootCode({ _orderRootCode: RootOrder.code })
    .send({
      amount: locklift.utils.toNano(0.1),
      from: account.address,
    });

  logMigrationProcess("factoryOrder", "setOrderCode", "Set code Order...");
  await factoryOrder.methods.setOrderCode({ _orderCode: Order.code }).send({
    amount: locklift.utils.toNano(0.1),
    from: account.address,
  });

  logMigrationProcess(
    "factoryOrder",
    "setOrderClosedCode",
    "Set code OrderClosed...",
  );
  await factoryOrder.methods
    .setOrderClosedCode({ _orderClosedCode: ClosedOrder.code })
    .send({
      amount: locklift.utils.toNano(0.1),
      from: account.address,
    });

  migration.store(factoryOrder, "OrderFactory");
  const rootToken = await locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    migration.getAddress("BarRoot"),
  );
  logMigrationProcess("factoryOrder", "createOrderRoot", "Create OrderRoot...");
  await factoryOrder.methods
    .createOrderRoot({ token: rootToken.address, callbackId: 1 })
    .send({
      amount: locklift.utils.toNano(3),
      from: account.address,
    });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
