import { Address, toNano, WalletTypes } from 'locklift';
import orderRoots from '../../../../order_roots.json';

const ORDER_FACTORY_ADDRESS =
  '0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4';
const orderRootsForUpdate: Address[] = [];

async function main() {
  const OrderFactory = await locklift.factory.getDeployedContract(
    'OrderFactory',
    new Address(ORDER_FACTORY_ADDRESS),
  );
  const Order = await locklift.factory.getContractArtifacts('Order');

  const limitOrdersManager = await OrderFactory.methods
    .getManager({ answerId: 0 })
    .call()
    .then((m) => m.value0);

  const manager = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: limitOrdersManager,
  });

  console.log('DexRoot:' + OrderFactory.address);
  console.log('Manager:' + manager.address);

  console.log(`Load list Order Roots`);
  for (const orderRootAddress of orderRoots) {
    orderRootsForUpdate.push(new Address(orderRootAddress.orderRoot));
  }

  console.log(`Upgrade code in Order Roots.`);
  await OrderFactory.methods
    .upgradeOrderCodeInOrderRoot({ listOrderRoots: orderRootsForUpdate })
    .send({
      from: manager.address,
      amount: toNano(0.5 * orderRootsForUpdate.length + 0.5),
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
