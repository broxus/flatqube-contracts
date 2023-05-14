import {Migration, displayTx, EMPTY_TVM_CELL, Constants} from '../utils/migration';
import {toNano, zeroAddress} from "locklift";
import {deployProject, deployRefFactory, deployRefSystem} from "../utils/ref";

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

    const DexVault = migration.loadContract('DexVault', 'DexVault');

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

    let refFactory = await deployRefFactory(mainAccount)
    console.log("RefFactory:", refFactory.address);
    migration.store(refFactory, "RefFactory");

    await refFactory.methods.setManager({newManager: DexVault.address}).send({from: mainAccount.address, amount: toNano(0.8)});

    // refSysOwner = Account2;
    let refSystem = await deployRefSystem(mainAccount, refFactory, owner, 300);
    console.log("RefSystem:", refSystem.address);
    migration.store(refSystem, "RefSystem");

    let { value0: refSysAccountAddr } = await refSystem.methods.deriveRefAccount({ answerId: 0, owner: additionalAccount.address }).call()
    let refSysAccount = locklift.factory.getDeployedContract("RefAccount", refSysAccountAddr);

    // projectOwner = account3
    let project = await deployProject(additionalAccount, refSystem, 5, 5);
    console.log("Project:", project.address);
    migration.store(project, "Project");

    await project.methods.setManager({
        manager: DexVault.address
    }).send({from: additionalAccount.address, amount: toNano(0.6)});

    await refSystem.methods.setProjectApproval({ projectId: 0, value: true }).send({from: owner.address, amount: toNano(0.6)});

    await DexVault.methods.setReferralProgramParams({params: {
            projectId: 0,
            projectAddress: project.address,
            systemAddress: refSystem.address
        }}).send({
        from: mainAccount.address,
        amount: toNano(1),
    });

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
            roots: [poolLpRoot.address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [1]
        },
        {
            amount: 0,
            roots: [token_roots[1].address, token_roots[3].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: [2]
        },
        {
            amount: 0,
            roots: [token_roots[1].address, token_roots[4].address],
            outcoming: zeroAddress,
            numerator: 1,
            nextStepIndices: []
        }
    ];

    // const dexPair = migration.loadContract('DexPair', 'DexPoolTstFoo');
    let payload = (await dexPool.methods.buildCrossPairExchangePayload({
        id: 0,
        deployWalletGrams: toNano(0.1),
        expectedAmount: 0,
        outcoming: poolLpRoot.address,
        nextStepIndices: [0],
        steps: steps,
        recipient: emptyAccount.address,
        referrer: additionalAccount.address,
        success_payload: null,
        cancel_payload: null
    }).call()).value0;

    let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
        amount: '100000000000000000000',
        recipient: dexPool.address,
        deployWalletValue: 0,
        remainingGasTo: owner.address,
        notify: true,
        payload: payload,
        // @ts-ignore
    }).send({
        from: owner.address,
        amount: toNano(10),
    }));
    //
    // displayTx(tx);

    await traceTree?.beautyPrint();

    console.log("balanceChangeInfo");

    for(let addr in traceTree?.balanceChangeInfo) {
        console.log(addr + ": " + traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString());
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e);
        process.exit(1);
    });
