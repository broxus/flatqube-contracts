import {Migration, displayTx, EMPTY_TVM_CELL, Constants} from '../utils/migration';
import {toNano, zeroAddress} from "locklift";

const deposits = [
    { tokenId: 'foo', amount: '100000000000000000000000' },
    { tokenId: 'bar', amount: '100000000000000000000000' },
    { tokenId: 'qwe', amount: '100000000000000000000000' },
    { tokenId: 'tst', amount: '100000000000000000000000' }
];

async function main() {
    const migration = new Migration();
    const mainAccount = await migration.loadAccount('Account1', '0');
    const additionalAccount = await migration.loadAccount('Account3', '2');
    const owner = await migration.loadAccount('Account2', '1');

    const dexAccountN = migration.loadContract('DexAccount', 'DexAccount' + 2);
    const dexPool = migration.loadContract('DexStablePool', 'DexPoolFooBarQwe');
    const poolLpRoot = migration.loadContract('TokenRootUpgradeable', 'FooBarQweLpRoot');

    const token_roots = [];
    const symbols = [];
    for (const deposit of deposits) {
        const symbol = Constants.tokens[deposit.tokenId].symbol;
        symbols.push(symbol);
        token_roots.push(migration.loadContract(
            'TokenRootUpgradeable',
            symbol + 'Root'
        ));
    }

    const accountWalletFoo = await locklift.factory.getDeployedContract('TokenWalletUpgradeable', (await token_roots[0].methods
        .walletOf({
            answerId: 0,
            walletOwner: owner.address,
        })
        .call()).value0);

    const accountWalletLp = await locklift.factory.getDeployedContract('TokenWalletUpgradeable', (await poolLpRoot.methods
        .walletOf({
            answerId: 0,
            walletOwner: owner.address,
        })
        .call()).value0);

    // let payload = (await dexPool.methods.buildExchangePayload({
    //     id: 0,
    //     deploy_wallet_grams: 0,
    //     expected_amount: 0,
    //     outcoming: token_roots[1].address,
    //     recipient: owner.address,
    //     referrer: additionalAccount.address,
    //     success_payload: null,
    //     cancel_payload: null
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
    //     amount: '100000000000000000000',
    //     recipient: dexPool.address,
    //     deployWalletValue: 0,
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(4),
    // }));

    // let payload = (await dexPool.methods.buildDepositLiquidityPayload({
    //     id: 0,
    //     deploy_wallet_grams: 0,
    //     expected_amount: 0,
    //     recipient: owner.address,
    //     referrer: zeroAddress,
    //     success_payload: null,
    //     cancel_payload: null
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
    //     amount: '100000000000000000000',
    //     recipient: dexPool.address,
    //     deployWalletValue: 0,
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(3),
    // }));

    // let payload = (await dexPool.methods.buildWithdrawLiquidityPayload({
    //     id: 0,
    //     deploy_wallet_grams: 0,
    //     expected_amounts: [],
    //     recipient: owner.address,
    //     referrer: zeroAddress,
    //     success_payload: null,
    //     cancel_payload: null
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(accountWalletLp.methods.transfer({
    //     amount: '100000000000',
    //     recipient: dexPool.address,
    //     deployWalletValue: 0,
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(3),
    // }));

    // let payload = (await dexPool.methods.buildWithdrawLiquidityOneCoinPayload({
    //     id: 0,
    //     deploy_wallet_grams: 0,
    //     expected_amount: 0,
    //     outcoming: token_roots[0].address,
    //     recipient: owner.address,
    //     referrer: zeroAddress,
    //     success_payload: null,
    //     cancel_payload: null
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(accountWalletLp.methods.transfer({
    //     amount: '100000000000',
    //     recipient: dexPool.address,
    //     deployWalletValue: 0,
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(3),
    // }));

    let steps = [
        {
            amount: 0,
            roots: [token_roots[1].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [1]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[1].address, token_roots[2].address],
            outcoming: token_roots[0].address,
            numerator: 1,
            nextStepIndices: [2]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [3]
        },
        {
            amount: 0,
            roots: [token_roots[1].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [4]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[1].address, token_roots[2].address],
            outcoming: token_roots[0].address,
            numerator: 1,
            nextStepIndices: [5]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [6]
        },
        {
            amount: 0,
            roots: [token_roots[1].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [7]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[1].address, token_roots[2].address],
            outcoming: token_roots[0].address,
            numerator: 1,
            nextStepIndices: [8]
        },
        {
            amount: 0,
            roots: [token_roots[0].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: []
        }
    ];

    // const dexPair = migration.loadContract('DexPair', 'DexPoolTstFoo');
    // let payload = (await dexPair.methods.buildCrossPairExchangePayloadV2({
    //     _id: 0,
    //     _deployWalletGrams: 0,
    //     _expectedAmount: 0,
    //     _outcoming: zeroAddress,
    //     _nextStepIndices: [0],
    //     _steps: steps,
    //     _recipient: owner.address,
    //     _referrer: zeroAddress,
    //     _successPayload: null,
    //     _cancelPayload: null
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
    //     amount: '100000000000',
    //     recipient: dexPair.address,
    //     deployWalletValue: 0,
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(10),
    // }));
    //
    // await traceTree?.beautyPrint();
    //
    // console.log("balanceChangeInfo");
    //
    // for(let addr in traceTree?.balanceChangeInfo) {
    //     console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString());
    // }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e);
        process.exit(1);
    });
