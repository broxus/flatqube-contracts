import { Address, toNano, WalletTypes } from 'locklift';
import { yellowBright } from 'chalk';
import orders from '../../../../orders.json';

const ORDER_FACTORY_ADDRESS =
  '0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4';

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

async function main() {
  const OrderFactory = await locklift.factory.getDeployedContract(
    'OrderFactory',
    new Address(ORDER_FACTORY_ADDRESS),
  );

  const limitOrdersManager = await OrderFactory.methods
    .getManager({ answerId: 0 })
    .call()
    .then((m) => m.value0);

  const manager = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: limitOrdersManager,
  });

  console.log('Order Factory:' + OrderFactory.address);
  console.log('Manager:' + manager.address);

  const params = orders.map((a) => ({
    orderAddress: a.orderRoot,
  }));

  for (const chunk of chunkify(params, 10)) {
    const { traceTree } = await locklift.tracing.trace(
      OrderFactory.methods
        .upgradeOrder({
          listOrders: chunk.map((a) => new Address(a.orderAddress)),
        })
        .send({
          from: manager.address,
          amount: toNano(chunk.length * 0.5 + 1),
        }),
    );

    for (const orders of chunk) {
      const Order = locklift.factory.getDeployedContract(
        'Order',
        new Address(orders.orderAddress),
      );

      const events = traceTree.findEventsForContract({
        contract: Order,
        name: 'OrderCodeUpgraded' as const,
      });

      if (events.length > 0) {
        console.log(
          `Order ${orders.orderAddress} upgraded. Current version: ${events[0].newVersion}`,
        );
      } else {
        console.log(
          yellowBright(`Order ${orders.orderAddress} wasn't upgraded`),
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
