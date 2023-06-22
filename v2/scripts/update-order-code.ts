import {Address, toNano} from "locklift";
import orderRoots from 'order_roots.json';
import orders from 'orders.json';

const {Migration} = require(process.cwd()+'/scripts/utils')
const migration = new Migration();

const ORDER_FACTORY_ADDRESS = "0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4";

const orderRootsForUpdate: Address[] = [];
const ordersForUpdate: Address[] = [];

async function main() {
    const account = await migration.loadAccount('Account1', '0');

    const OrderFactory = await locklift.factory.getDeployedContract('OrderFactory', new Address(ORDER_FACTORY_ADDRESS));
    const Order = await locklift.factory.getContractArtifacts('Order');

    console.log(`Set code Order on Factory`);
    await OrderFactory.methods.setOrderCode({ _orderCode: Order.code }).send({
        from: account.address,
        amount: toNano(0.1),
    });

    console.log(`Load list Order Roots`);
    for (const orderRootAddress of orderRoots) {
        orderRootsForUpdate.push(new Address(orderRootAddress.orderRoot));
    }

    console.log(`Load list Orders`);
    for (const orderAddress of orders) {
        ordersForUpdate.push(new Address(orderAddress.order));
    }

    console.log(`Upgrade code in Order Roots.`);
    await OrderFactory.methods.upgradeOrderCodeInOrderRoot({listOrderRoots: orderRootsForUpdate}).send({
        from: account.address,
        amount: toNano((0.1 * orderRootsForUpdate.length)+0.1)
    });

    console.log(`Upgrade orders.`);
    await OrderFactory.methods.upgradeOrder({listOrders: ordersForUpdate}).send({
        from: account.address,
        amount: toNano((0.5*ordersForUpdate.length)+0.1)
    });
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
});