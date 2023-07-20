import {Address, toNano, WalletTypes} from "locklift";
import order_roots from '../../../../order_roots.json';
import {yellowBright} from "chalk";

const ORDER_FACTORY_ADDRESS =
    '0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4';
const chunkify = <T>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size),
);

async function main(){
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

    const params = order_roots.map((a) => ({
        orderAddress: a.orderRoot
    }));

    for (const chunk of chunkify(params, 10)) {
        const {traceTree} = await locklift.tracing.trace(
            OrderFactory.methods
                .upgradeOrderRoot({
                    listOrderRoots: chunk.map((a) => new Address(a.orderAddress))
            })
            .send({
                from: manager.address,
                amount: toNano(chunk.length * 0.2 + 1),
            }),
        );

        for (const order_roots of chunk) {
            const OrderRoot = locklift.factory.getDeployedContract(
                'OrderRoot',
                new Address(order_roots.orderAddress),
            );

            const events = traceTree.findEventsForContract({
                contract: OrderRoot,
                name: 'OrderRootCodeUpgraded' as const,
            });

            if (events.length > 0) {
                console.log(
                    `OrderRoot ${order_roots.orderAddress} upgraded. Current version: ${events[0].newVersion}`,
                );
            } else {
                console.log(
                    yellowBright(`OrderRoot ${order_roots.orderAddress} wasn't upgraded`),
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