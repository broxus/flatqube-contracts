import {Address, toNano, WalletTypes} from "locklift";

const ORDER_FACTORY_ADDRESS = "0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4";

async function main() {
    const OrderFactory = await locklift.factory.getDeployedContract(
        'OrderFactory',
        new Address(ORDER_FACTORY_ADDRESS)
    );
    const Order = await locklift.factory.getContractArtifacts('Order');

    const limitOrdersManager = await OrderFactory.methods
        .getManager({answerId: 0})
        .call()
        .then((m)=>m.value0);

    const manager = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: limitOrdersManager
    });

    console.log('OrderFactory:' + OrderFactory.address);
    console.log('Manager:' + manager.address);

    console.log(`Set code Order on Factory`);
    await OrderFactory.methods.setOrderCode({ _orderCode: Order.code }).send({
        from: manager.address,
        amount: toNano(0.1),
    });
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });