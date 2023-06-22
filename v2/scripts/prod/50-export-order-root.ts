import {writeFileSync} from "fs";

const ORDER_ROOT_CODE_HASH = '75e59d7ac15f9c12339fcd01998916ba9fc4ecc65ed7e557d3b1e3cd7e70938d';
const ORDER_FACTORY_ADDRESS = '0:3c8d39684cabbb780ff77710b02923c59ea2be84e211b09c3258eef344d394a4';

async function main() {
    const orderRootsForUpdate = [];
    let continuation = undefined;
    let hasResults = true;
    while (hasResults) {
        const result: any = await locklift.provider.getAccountsByCodeHash({
            codeHash: ORDER_ROOT_CODE_HASH,
            continuation,
            limit: 50,
        });
        continuation = result.continuation;
        hasResults = result.accounts.length === 50;
        for (const orderRootAddress of result.accounts) {
            const OrderRoot = await locklift.factory.getDeployedContract(
                'OrderRoot',
                orderRootAddress
            );

            const factoryAddress = (await OrderRoot.methods.getFactory({answerId: 0}).call({})).value0.toString();
            if (factoryAddress == ORDER_FACTORY_ADDRESS) {
                orderRootsForUpdate.push({
                    orderRoot: orderRootAddress,
                });
            }
        }
    }

    console.log(`Count order roots: ${orderRootsForUpdate.length}`);

    writeFileSync(
        './order_roots.json',
        JSON.stringify(orderRootsForUpdate, null, 2),
    );
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e);
        process.exit(1);
});