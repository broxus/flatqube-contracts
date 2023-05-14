import {Migration, displayTx, EMPTY_TVM_CELL, Constants} from '../utils/migration';
import {Address, toNano, zeroAddress} from "locklift";

const deposits = [
    { tokenId: 'foo', amount: '100000000000000000000000' },
    { tokenId: 'bar', amount: '100000000000000000000000' },
    { tokenId: 'qwe', amount: '100000000000000000000000' },
    { tokenId: 'tst', amount: '100000000000000000000000' },
    { tokenId: 'coin', amount: '100000000000000000000000' },
];

async function main() {
    const migration = new Migration();
    const mainAccount = await migration.loadAccount('Account1', '0');
    const additionalAccount = await migration.loadAccount('Account3', '2');
    const owner = await migration.loadAccount('Account2', '1');

    const emptyAccount = await migration.loadAccount('Account4', '3');

    const everToTip3 = migration.loadContract('EverToTip3', 'EverToTip3');
    const tip3ToEver = migration.loadContract('Tip3ToEver', 'Tip3ToEver');
    const everWeverToTip3 = migration.loadContract('EverWeverToTip3', 'EverWeverToTip3');

    const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

    const dexAccountN = migration.loadContract('DexAccount', 'DexAccount' + 2);
    const wEverWallet2 = migration.loadContract('TokenWalletUpgradeable', 'WEVERWallet2');
    const dexPool = migration.loadContract('DexStablePool', 'DexPoolFooBarQwe');
    const dexPairFooWever = migration.loadContract('DexPair', 'DexPoolFooWEVER');
    const DexPoolFooBarQweLpTst = migration.loadContract('DexPair', 'DexPoolFooBarQweLpTst');
    const dexPairTstBar = migration.loadContract('DexPair', 'DexPoolTstBar');
    const dexPairBarCoin = migration.loadContract('DexPair', 'DexPoolBarCoin');

    const fooWeverLpRoot = migration.loadContract('TokenRootUpgradeable', 'FooWEVERLpRoot');
    const poolLpRoot = migration.loadContract('TokenRootUpgradeable', 'FooBarQweLpRoot');

    const wEverRoot = migration.loadContract('TokenRootUpgradeable', 'WEVERRoot');
    const wEverVault = migration.loadContract('TestWeverVault', 'WEVERVault');

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

    let fee = {
        "denominator": "1000000",
        "pool_numerator": "0",
        "beneficiary_numerator": "5000",
        "referrer_numerator": "5000",
        "beneficiary": additionalAccount.address,
        "threshold": [
            [
                token_roots[0].address,
                "500000000000"
            ],
            [
                wEverRoot.address,
                "500"
            ],
        ],
        "referrer_threshold": []
    }

    await dexRoot.methods.setPairFeeParams({
        _roots: [token_roots[0].address, wEverRoot.address],
        _params: fee,
        _remainingGasTo: mainAccount.address
    }).send({
        from: mainAccount.address,
        amount: toNano(1.5),
    });

    await dexAccountN.methods.addPool({_roots: [token_roots[0].address, wEverRoot.address]}).send({
        from: owner.address,
        amount: toNano(4),
    });

    let tx = await wEverWallet2.methods.transfer({
        amount: '500000000000',
        recipient: dexAccountN.address,
        deployWalletValue: 100000000,
        remainingGasTo: owner.address,
        notify: true,
        payload: EMPTY_TVM_CELL,
        // @ts-ignore
    }).send({
        from: owner.address,
        amount: toNano(2),
    });
    displayTx(tx);

    // initial deposit
    tx = await dexAccountN.methods.depositLiquidityV2({
        _callId: 123,
        _operations: [{amount: '500000000000', root: wEverRoot.address},{amount: '5000000000000000000000', root: token_roots[0].address}],
        _expected: {amount: '0', root: fooWeverLpRoot.address},
        _autoChange: false,
        _remainingGasTo: owner.address,
        _referrer: owner.address
    }).send({
        from: owner.address,
        amount: toNano(4),
    });
    displayTx(tx);

    console.log('Ever to Tip3:');
    const EVERS_TO_EXCHANGE = 10;
    // let payload = (await everToTip3.methods.buildExchangePayload({
    //     id: 66,
    //     pair: dexPairTstWever.address,
    //     expectedAmount: 0,
    //     deployWalletValue: toNano(0.1),
    //     referrer: zeroAddress,
    //     outcoming: null
    // }).call()).value0;

    let steps = [
        {
            amount: 0,
            pool: dexPool.address,
            outcoming: poolLpRoot.address,
            numerator: 1,
            nextStepIndices: [1]
        },
        {
            amount: 0,
            pool: DexPoolFooBarQweLpTst.address,
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [2]
        },
        {
            amount: 0,
            pool: dexPairTstBar.address,
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [3]
        },
        {
            amount: 0,
            pool: dexPairBarCoin.address,
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: []
        }
    ];

    // let payload = (await everToTip3.methods.buildCrossPairExchangePayload({
    //     id: 66,
    //     pool: dexPairTstWever.address,
    //     expectedAmount: 0,
    //     deployWalletValue: toNano(0.1),
    //     nextStepIndices: [0],
    //     steps: steps,
    //     referrer: zeroAddress,
    //     outcoming: zeroAddress
    // }).call()).value0;
    //
    // let { traceTree } = await locklift.tracing.trace(wEverVault.methods.wrap({
    //     tokens: toNano(EVERS_TO_EXCHANGE),
    //     owner_address: everToTip3.address,
    //     gas_back_address: owner.address,
    //     payload: payload
    // }).send({
    //     from: owner.address,
    //     amount: toNano(EVERS_TO_EXCHANGE + 5),
    // }));

    console.log('Tip3 to Ever');

    // let payload = (await tip3ToEver.methods.buildExchangePayload({
    //     id: 66,
    //     pair: dexPairTstWever.address,
    //     expectedAmount: 0,
    //     referrer: zeroAddress,
    //     outcoming: null
    // }).call()).value0;

    // const tstWallet2 = migration.loadContract('TokenWalletUpgradeable', 'TstWallet2');
    // let { traceTree } = await locklift.tracing.trace(tstWallet2.methods.transfer({
    //     amount: '100000000000000000000',
    //     recipient: tip3ToEver.address,
    //     deployWalletValue: toNano(0.1),
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(4),
    // }));

    // steps[8].nextStepIndices = [9];
    // steps.push({
    //     amount: 0,
    //     pool: dexPairTstWever.address,
    //     outcoming: zeroAddress,
    //     numerator: 1,
    //     nextStepIndices: []
    // });
    //
    // let payload = (await tip3ToEver.methods.buildCrossPairExchangePayload({
    //     id: 66,
    //     pool: dexPairTstFoo.address,
    //     expectedAmount: 0,
    //     deployWalletValue: toNano(0.1),
    //     nextStepIndices: [0],
    //     steps: steps,
    //     referrer: zeroAddress,
    //     outcoming: zeroAddress
    // }).call()).value0;

    // const fooWallet2 = migration.loadContract('TokenWalletUpgradeable', 'FooWallet2');
    // let { traceTree } = await locklift.tracing.trace(fooWallet2.methods.transfer({
    //     amount: '100000000000000000000',
    //     recipient: tip3ToEver.address,
    //     deployWalletValue: toNano(0.1),
    //     remainingGasTo: owner.address,
    //     notify: true,
    //     payload: payload,
    //     // @ts-ignore
    // }).send({
    //     from: owner.address,
    //     amount: toNano(10),
    // }));

    console.log('Ever and Wever to Tip3');

    const WEVERS_TO_EXCHANGE = 10;

    // let payload = (await everWeverToTip3.methods.buildExchangePayload({
    //     id: 11,
    //     amount: toNano(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE),
    //     pair: dexPairTstWever.address,
    //     expectedAmount: 0,
    //     deployWalletValue: toNano(0.1),
    //     referrer: zeroAddress,
    //     outcoming: null
    // }).call()).value0;

    let payload = (await everWeverToTip3.methods.buildCrossPairExchangePayload({
        id: 11,
        amount: toNano(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE),
        pool: dexPairFooWever.address,
        expectedAmount: 0,
        deployWalletValue: toNano(0.1),
        nextStepIndices: [0],
        steps: steps,
        referrer: mainAccount.address,
        outcoming: zeroAddress
    }).call()).value0;

    tx = await wEverWallet2.methods.transfer({
        amount: toNano(WEVERS_TO_EXCHANGE),
        recipient: everWeverToTip3.address,
        deployWalletValue: toNano(0.1),
        remainingGasTo: emptyAccount.address,
        notify: true,
        payload: payload,
        // @ts-ignore
    }).send({
        from: owner.address,
        amount: toNano(EVERS_TO_EXCHANGE + 10),
    });

    displayTx(tx);


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
