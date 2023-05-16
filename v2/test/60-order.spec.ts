import chalk from "chalk";
import {expect} from 'chai';
import BigNumber from "bignumber.js";
import {Account} from 'everscale-standalone-client/nodejs';

import {Address, Contract, getRandomNonce, toNano, WalletTypes, zeroAddress} from 'locklift';
import {FactorySource} from '../../build/factorySource';
//@ts-ignore
import {accountMigration, logMigrationSuccess, tokenRootMigration,} from '../../v2/utils';

import {
    dexAccountMigration,
    dexPairMigration,
    dexRootMigration,
    orderFactoryMigration,
    orderRootMigration,
    tokenFactoryMigration
} from "../utils/migration.new.utils";

import {TokenWallet} from "../utils/wrappers/tokenWallet";

import {OrderFactory} from "../utils/wrappers/order_factory";
import {OrderRoot} from "../utils/wrappers/order_root";
import {OrderWrapper} from "../utils/wrappers/order";

describe('OrderTest', () => {
    const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';
    const barDecimals = 9;
    const tstDecimals = 9;

    let TOKENS_TO_EXCHANGE1;
    let TOKENS_TO_EXCHANGE1_ACC3;
    let TOKENS_TO_EXCHANGE1_ACC4;
    let TOKENS_TO_EXCHANGE1_ACC5;

    let TOKENS_TO_EXCHANGE2;
    let TOKENS_TO_EXCHANGE2_ACC3;
    let TOKENS_TO_EXCHANGE2_ACC4;
    let TOKENS_TO_EXCHANGE2_ACC5;

    let TOKENS_TO_EXCHANGE_SPENT1;
    let TOKENS_TO_EXCHANGE_RECEIVE1;
    let TOKENS_TO_EXCHANGE_SPENT2;
    let TOKENS_TO_EXCHANGE_RECEIVE2;

    let NUMERATOR;
    let DENOMINATOR;
    let MATCHINGNUMERATOR;
    let MATCHINGDENOMINATOR;

    let factoryOrder: OrderFactory;
    let RootOrderBar: OrderRoot;
    let RootOrderTst: OrderRoot;

    let rootTokenBar: Contract<FactorySource['TokenRootUpgradeable']>;
    let rootTokenReceive: Contract<FactorySource['TokenRootUpgradeable']>;
    let FooBarLpRoot: Contract<FactorySource['TokenRootUpgradeable']>;

    let dexPair: Contract<FactorySource['DexPair']>;

    let account1: Account;

    let account2: Account;
    let barWallet2: TokenWallet;
    let tstWallet2: TokenWallet;

    let account3: Account;
    let barWallet3: TokenWallet;
    let tstWallet3: TokenWallet;

    let account4: Account;
    let barWallet4: TokenWallet;
    let tstWallet4: TokenWallet;

    let account5: Account;
    let barWallet5: TokenWallet;
    let tstWallet5: TokenWallet;

    let account6: Account;
    let barWallet6: TokenWallet;
    let tstWallet6: TokenWallet;

    let account7: Account;

    let account8: Account;

    let FactoryWalletTst: TokenWallet;
    let tokenFactory: Contract<FactorySource['TokenFactory']>;
    let dexAccount: Contract<FactorySource['DexAccount']>;

    before('deploy and load new migrations', async () => {
        account1 = await accountMigration('10000', "Account1", "1");
        account2 = await accountMigration('10000', "Account2", "2");
        account3 = await accountMigration('10000', "Account3", "3");
        account4 = await accountMigration('10000', "Account4", "4");
        account5 = await accountMigration('10000', "Account5", "5");
        account6 = await accountMigration('10000', "Account6", "6");
        account7 = await accountMigration('10000', "Account7", "7");
        account8 = await accountMigration('10000', "Account8", "8");

        tokenFactory = await tokenFactoryMigration(account1);

        const [dexRoot, dexVault] = await dexRootMigration(account1, tokenFactory);

        dexAccount = await dexAccountMigration(account1, dexRoot);

        rootTokenBar = await tokenRootMigration(
            'BarRoot',
            'BAR',
            barDecimals,
            account1
        );
        rootTokenReceive = await tokenRootMigration(
            'TstRoot',
            'TST',
            tstDecimals,
            account1
        );

        const wallet1Address = await deployWallet(account1, rootTokenReceive, account1, 3000)
        const wallet1 = await TokenWallet.from_addr(wallet1Address, account1, 'wallet1');

        const wallet2Address = await deployWallet(account1, rootTokenBar, account1, 3000)
        const wallet2 = await TokenWallet.from_addr(wallet2Address, account1, 'wallet2');
        const addressFactory = await orderFactoryMigration(account1, 1, dexRoot, 0, 0, 0 ,0)
        factoryOrder = await OrderFactory.from_addr(addressFactory.address, account1);
        const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
        FactoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "FactoryWalletTst");

        dexPair = await dexPairMigration(
            account1,
            dexRoot,
            'BAR',
            rootTokenBar,
            'TST',
            rootTokenReceive
        )

        const isActive = await dexPair.methods.isActive({answerId: 0}).call()
        console.log(`IS ACTIVE - ${isActive.value0}`)
        const lproot = await dexPair.methods.getTokenRoots({
            answerId: 1
        }).call()
        FooBarLpRoot = await locklift.factory.getDeployedContract("TokenRootUpgradeable", lproot.lp)

        logMigrationSuccess(
            'DexPair',
            'getTokenRoots',
            `LP root for BAR/TST : ${FooBarLpRoot.address}`,
        );
        await locklift.tracing.trace(
            dexAccount.methods.addPair({
                left_root: lproot.left,
                right_root: lproot.right
            }).send({
                    amount: toNano(9), from: account1.address
                }), {allowedCodes: {compute: [100]}}
        )
        await locklift.tracing.trace(wallet1.transfer(
                numberString(2500, barDecimals), dexAccount.address, EMPTY_TVM_CELL, toNano(3),)
            );

        await wallet2.transfer(
                numberString(2500, barDecimals), dexAccount.address, EMPTY_TVM_CELL, toNano(3)
        );

        const TestFactory = await locklift.factory.getDeployedContract("OrderFactory", factoryOrder.address)
        const addressRootBar = await orderRootMigration(account1, TestFactory, rootTokenBar)
        const addressRootTST = await orderRootMigration(account1, TestFactory, rootTokenReceive)

        RootOrderBar = await OrderRoot.from_addr(addressRootBar.address, account1)
        RootOrderTst = await OrderRoot.from_addr(addressRootTST.address, account1)

        await locklift.tracing.trace(rootTokenBar.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: toNano(7),
            })
            .send({amount: toNano(9), from: account1.address}));

        await locklift.tracing.trace(rootTokenReceive.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: toNano(7),
            })
            .send({amount: toNano(9), from: account1.address}));

        const dataBar = await dexAccount.methods.getWalletData({token_root: rootTokenBar.address, answerId: 1}).call()
        const dataTST = await dexAccount.methods.getWalletData({token_root: rootTokenReceive.address, answerId: 1}).call()

        console.log(`BAR - ${dataBar.balance}\nTST-${dataTST.balance}`)

        await locklift.tracing.trace(
            dexAccount.methods.depositLiquidity({
                call_id: getRandomNonce(),
                left_root: rootTokenBar.address,
                left_amount: numberString(200, barDecimals),
                right_root: rootTokenReceive.address,
                right_amount: numberString(2000, barDecimals),
                expected_lp_root: lproot.lp,
                auto_change: true,
                send_gas_to: account1.address
            }).send({amount: toNano(4), from: account1.address})
        )

        const barWallet2Address = await deployWallet(account2, rootTokenBar, account1)
        barWallet2 = await TokenWallet.from_addr(barWallet2Address, account2, 'barWallet2');

        const tstWallet2Address = await deployWallet(account2, rootTokenReceive, account1)
        tstWallet2  = await TokenWallet.from_addr(tstWallet2Address, account2, 'tstWallet2' );

        const barWallet3Address = await deployWallet(account3, rootTokenBar, account1)
        barWallet3 = await TokenWallet.from_addr(barWallet3Address, account3, 'barWallet3');

        const tstWallet3Address = await deployWallet(account3, rootTokenReceive, account1)
        tstWallet3 = await TokenWallet.from_addr(tstWallet3Address, account3, 'tstWallet3');

        const barWallet4Address = await deployWallet(account4, rootTokenBar, account1)
        barWallet4 = await TokenWallet.from_addr(barWallet4Address, account4, 'barWallet4');

        const tstWallet4Address = await deployWallet(account4, rootTokenReceive, account1)
        tstWallet4 = await TokenWallet.from_addr(tstWallet4Address, account4, 'tstWallet4');

        const barWallet5Address = await deployWallet(account5, rootTokenBar, account1)
        barWallet5 = await TokenWallet.from_addr(barWallet5Address, account5, 'barWallet5');

        const tstWallet5Address = await deployWallet(account5, rootTokenReceive, account1)
        tstWallet5 = await TokenWallet.from_addr(tstWallet5Address, account5, 'tstWallet5');

        const barWallet6Address = await deployWallet(account6, rootTokenBar, account1)
        barWallet6 = await TokenWallet.from_addr(barWallet6Address, account6, 'barWallet6');

        const tstWallet6Address = await deployWallet(account6, rootTokenReceive, account1)
        tstWallet6 = await TokenWallet.from_addr(tstWallet6Address, account6, 'tstWallet6');

        console.log(`OrderFactory: ${factoryOrder.address}`);
        console.log(`OrderRootBar: ${RootOrderBar.address}`);
        console.log(`OrderRootTst: ${RootOrderTst.address}`);
        console.log(`BarRoot: ${rootTokenBar.address}`);
        console.log(`TSTRoot: ${rootTokenReceive.address}`);
        console.log(`Account1: ${account1.address}`);
        console.log('')
        console.log(`Account2: ${account2.address}`);
        console.log(`BarWallet2: ${barWallet2.address}`);
        console.log(`TstWallet2: ${tstWallet2.address}`);
        console.log('')
        console.log(`Account3: ${account3.address}`);
        console.log(`BarWallet3: ${barWallet3.address}`);
        console.log(`TstWallet3: ${tstWallet3.address}`);
        console.log('')
        console.log(`Account4: ${account4.address}`);
        console.log(`BarWallet4: ${barWallet4.address}`);
        console.log(`TstWallet4: ${tstWallet4.address}`);
        console.log('')
        console.log(`Account5: ${account5.address}`);
        console.log(`BarWallet5: ${barWallet5.address}`);
        console.log(`TstWallet5: ${tstWallet5.address}`);
        console.log('')
        console.log(`Account6: ${account6.address}`);
        console.log(`BarWallet6: ${barWallet6.address}`);
        console.log(`TstWallet6: ${tstWallet6.address}`);
        console.log('')

        const feesBar = await RootOrderBar.feeParams()
        console.log(`Beneficary = ${feesBar.params.beneficiary}\nFee - ${feesBar.params.numerator}/${feesBar.params.denominator}/
        ${feesBar.params.matchingNumerator}/${feesBar.params.matchingDenominator}`);

        const feesTst = await RootOrderTst.feeParams()
        console.log(`Beneficary = ${feesTst.params.beneficiary}\nFee - ${feesTst.params.numerator}/${feesTst.params.denominator}/
        ${feesTst.params.matchingNumerator}/${feesTst.params.matchingDenominator}`)
    });

    describe('Direct execution Order', async () => {
        it('Check full execution with 2 buyer, case 1.1', async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            const payload = await RootOrderBar.buildPayloadRoot(
                123123, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6),
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);

            const payloadLO = await order.buildPayload(1, 0.1);

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();

            // @ts-ignore
            expect(3).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await (locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Check partial execution Order, case 2.1', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, barDecimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, tstDecimals);
            await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 5;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 10;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            console.log(order.address);
            const payloadLO = await order.buildPayload('1', 0.1);

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}})

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}})

            await locklift.tracing.trace(tstWallet6.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC5, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}})

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, barDecimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, tstDecimals);
            await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC5)).toString();

            expect(3).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
            expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Account6 Bar balance');
            expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Account6 Tst balance');
        });
        it('Check partial execution Order, case 2.2', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, barDecimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, tstDecimals);
            await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 10;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 20;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
                )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6),
            ), {allowedCodes: {compute: [60]}});
            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload('1', 0.1);

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            await locklift.tracing.trace(tstWallet6.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC5, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, barDecimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, tstDecimals);
            await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC5 - 5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC5 - 10)).toString();

            expect(3).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
            expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Account6 Bar balance');
            expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Account6 Tst balance');
        });
        it('Check create order and closed, case 3.1', async () => {
            console.log(`#############################`);
            console.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, account4.address, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account4);
            await order.cancel()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE1)).toString()
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE1)).toString()

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');

            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');

            expect(5).to.equal((Number(await order.status())), 'Wrong status Limit order');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order.address))), "Wrong Order Ever balance")
        });
        it('Check create order, part exhcange and closed, case 3.2', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            TOKENS_TO_EXCHANGE2_ACC3 = 10;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
                )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload('1', 0.1);

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            await order.cancel()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();

            expect(5).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Check execution closed order, case 4.1', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 15;
            TOKENS_TO_EXCHANGE2 = 30;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
                )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload('1', 0.1);

           await order.cancel()

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            expect(5).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Check execution closed order BY BACKEND, case 4.2', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 15;
            TOKENS_TO_EXCHANGE2 = 30;
            const signer = await locklift.keystore.getSigner("5");

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                `0x${signer.publicKey}`, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload('1', 0.1);

            await order.backendCancel(signer, 15)

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2, tstDecimals), order.address, payloadLO, toNano(5)
            ), {allowedCodes: {compute: [60]}});

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            expect(5).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
    });
    describe('Execution order via DEX', async () => {
        it('Order from backend SUCCESS', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const signer = await locklift.keystore.getSigner("3");
            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                `0x${signer.publicKey}`, 0)

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});
            const order = await RootOrderBar.getEventCreateOrder(account3);

            console.log(`Limit order: ${order.address}`);
            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${numberString(Number(expected.expected_fee), -barDecimals)} BAR`);
            console.log(`Expected receive amount: ${numberString(Number(expected.expected_amount), -tstDecimals)} TST`);

            await order.backendSwap(signer, true, true)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-tstDecimals))).toString();

            expect(3).to.equal((Number(await order.status())), 'Wrong status Limit order');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order.address))), "Wrong Order Ever balance")
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Order from backend CANCEL', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 100;
            const signer = await locklift.keystore.getSigner("3");

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                `0x${signer.publicKey}`, 0)

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            console.log(`Limit order: ${order.address}`);
            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${numberString(Number(expected.expected_fee), -barDecimals)} BAR`);
            console.log(`Expected receive amount: ${numberString(Number(expected.expected_amount), -tstDecimals)} TST`);

            await order.backendSwap(signer, true, true)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(2).to.equal((Number(await order.status())), 'Wrong status Limit order');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Order from user SUCCESS', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes:{compute:[60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            console.log(`Limit order: ${order.address}`);
            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${numberString(Number(expected.expected_fee), -barDecimals)} BAR`);
            console.log(`Expected receive amount: ${numberString(Number(expected.expected_amount), -tstDecimals)} TST`);

            await order.swap(1, 0.1, account4.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-tstDecimals)).minus(new BigNumber(TOKENS_TO_EXCHANGE2))).toString();

            expect(3).to.equal((Number(await order.status())), 'Wrong status Limit order');
            expect(0).to.be.equal(Number(await(locklift.provider.getBalance(order.address))), 'Wrong Balance Ever Limit Order')
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Order from user CANCEL', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 100;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute:[60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            console.log(`Limit order: ${order.address}`);
            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                spent_token_root: rootTokenBar.address
            }).call();

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${numberString(Number(expected.expected_fee), -barDecimals)} BAR`);
            console.log(`Expected receive amount: ${numberString(Number(expected.expected_amount), -tstDecimals)} TST`);

            await order.swap(1, 0.1, account3.address, true, true)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();

            expect(2).to.equal((Number(await order.status())), 'Wrong status Limit order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
        });
    });
    describe('Emergency mode', async () => {
        it('Emergency mode on, send TIP3, off', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes: {compute: [60]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const signer1 = await locklift.keystore.getSigner("1");
            await factoryOrder.setEmergency(
                true, order.address, `0x${signer1.publicKey}`
            )

            expect(6).to.equal(Number(await order.status()), 'Wrong status Limit order');

            const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
                walletOwner: order.address,
                answerId: 1
            }).call()

            await order.proxyTokensTransfer(
                tokenWalletBarToken.value0,
                0.4,
                numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                account3.address,
                0,
                account1.address,
                true,
                EMPTY_TVM_CELL,
                true,
                signer1
                )

            await factoryOrder.setEmergency(
                false, order.address, `0x${signer1.publicKey}`
            )

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(2).to.equal(Number(await order.status()), 'Wrong status Limit order');
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Emergency mode on, send TIP3, off (Bad OrderClosed contract)', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const BadOrderCode = (await locklift.factory.getContractArtifacts('TestNewOrderBad')).code

            await factoryOrder.setOrderCode(BadOrderCode)
            //let roots : Address[] = [RootOrderBar.address, RootOrderTst.address];
            //await factoryOrder.upgradeOrderInOrderRoot(roots);

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ), {allowedCodes:{compute: [60]}});
            let order = await RootOrderBar.getEventCreateOrder(account3);
            let orders:Address[] = [order.address];
            await factoryOrder.updateOrder(orders)
            order = new OrderWrapper((await locklift.factory.getDeployedContract("TestNewOrderBad", order.address)), account3);

            await order.cancel(15);

            const balanceBarAcc3Proccess = await accountTokenBalances(barWallet3, barDecimals);
            expect(balanceBarAcc3Proccess.token.toString()).to.equal(balanceBarAcc3Start.token.minus(TOKENS_TO_EXCHANGE1).toString(), 'Wrong Account3 Bar balance');
            const signer1 = await locklift.keystore.getSigner("1");
            await factoryOrder.setEmergency(
                true, order.address, `0x${signer1.publicKey}`
            )

            expect(6).to.equal(Number(await order.status()), 'Wrong status Limit order');

            const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
                walletOwner: order.address,
                answerId: 1
            }).call()
            await order.proxyTokensTransfer(
                tokenWalletBarToken.value0,
                0.4,
                numberString(TOKENS_TO_EXCHANGE1, barDecimals),
                account3.address,
                0,
                account1.address,
                true,
                EMPTY_TVM_CELL,
                true,
                signer1
                )

            const GasAccount3 = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9)
            const GasOrder = new BigNumber(await locklift.provider.getBalance(order.address)).shiftedBy(-9)
            console.log(`GasAccount3 - ${GasAccount3.toString()}\nGasOrder - ${GasOrder.toString()}`)

            await order.sendGas(account3.address, toNano(GasOrder.minus(1).toString()), 66, signer1)
            await factoryOrder.setEmergency(
                false, order.address, `0x${signer1.publicKey}`
            )

            const GasAccount3End = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9)
            console.log(GasAccount3End.minus(GasAccount3).toString())
            console.log(GasOrder.minus(1).toString())

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(5).to.equal(Number(await order.status()), 'Wrong status Limit order');
            expect(GasAccount3End.minus(GasAccount3).plus(0.3).isGreaterThanOrEqualTo(GasOrder.minus(1))).to.equal(true, 'Wrong gas Balance');
            // @ts-ignore
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Test proxyTokensTransfer and sendGas on OrderRoot', async () => {
            console.log(`#############################`);
            console.log(``);

            const walletRootBarAddress = (await rootTokenBar.methods.walletOf({
                answerId: 0,
                walletOwner: RootOrderBar.address
            }).call())
            const walletRootBar = await TokenWallet.from_addr(walletRootBarAddress.value0, factoryOrder.address, "factoryWalletTst");

            await locklift.provider.sendMessage({
                sender: account1.address,
                recipient: RootOrderBar.address,
                amount: toNano(2),
                bounce: false,
            });

            await factoryOrder.contract.methods.sendGasRoot({
                to: account8.address,
                _value: toNano(1),
                _flag: 66,
                root: RootOrderBar.address
            }).send({
                from: account1.address, amount: toNano(0.2)
            })

            const mainCode = (await locklift.factory.getContractArtifacts("OrderRoot")).code
            const testFactoryCode = (await locklift.factory.getContractArtifacts("TestNewOrderRoot")).code
            await factoryOrder.setOrderRootCode(testFactoryCode)
            let roots:Address[] = [RootOrderBar.address];
            await factoryOrder.upgradeOrderRoot(roots)

            const newRoot = await locklift.factory.getDeployedContract("TestNewOrderRoot", RootOrderBar.address)
            // Проверяем

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(50, barDecimals), RootOrderBar.address, '', toNano(6)
            ), {allowedCodes: {compute:[60]}});

            const barWallet8Address = await deployWallet(account8, rootTokenBar, account1)
            const barWallet8 = await TokenWallet.from_addr(barWallet8Address, account6, 'barWallet8');

            const tokenRootStart = new BigNumber(await walletRootBar.balance())
            const tokenAccountStart = new BigNumber(await barWallet8.balance())

            await locklift.provider.sendMessage({
                sender: account1.address,
                recipient: RootOrderBar.address,
                amount: toNano(2),
                bounce: false,
            });

            await locklift.tracing.trace(factoryOrder.contract.methods.proxyRootTokensTransfer({
                _notify: true,
                _deployWalletValue: toNano(0.1),
                _payload: '',
                _gasValue: toNano(0.2),
                _remainingGasTo: account8.address,
                _amount: numberString(50, barDecimals),
                root: RootOrderBar.address,
                _tokenWallet: walletRootBar.address,
                _recipient: account8.address
            }).send({
                from: account1.address, amount: toNano(2)
            }));

            const tokenRootEnd = new BigNumber(await walletRootBar.balance())
            const tokenAccountEnd = new BigNumber(await barWallet8.balance())

            await factoryOrder.setOrderRootCode(mainCode)
            await factoryOrder.upgradeOrderRoot(roots)

            expect(tokenRootStart.minus(tokenRootEnd).isGreaterThanOrEqualTo(new BigNumber(numberString(50, barDecimals)))).to.equal(true, 'Wrong gas Balance');
            expect(tokenAccountEnd.minus(tokenAccountStart).isGreaterThanOrEqualTo(new BigNumber(numberString(50, barDecimals)))).to.equal(true, 'Wrong gas Balance');
        });
    });
    describe('Matching orders', async  () => {
        it('Matching on full filled 1', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            let listRoots:Address[] = [RootOrderTst.address];
            await factoryOrder.setRootFeeParams(
                listRoots,
                0, 0, 1, 2, zeroAddress, true
            )

            const feeParams = await RootOrderTst.feeParams()
            expect(feeParams.params.numerator).to.equal('0', 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal('0', 'Wrong DENOMINATOR');
            expect(Number(feeParams.params.matchingNumerator)).to.equal(1, 'Wrong MATCHINGNUMERATOR');
            expect(Number(feeParams.params.matchingDenominator)).to.equal(2, 'Wrong MATCHINGDENOMINATOR');

            TOKENS_TO_EXCHANGE_SPENT1 = 30;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 20;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderTst.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6),
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            let detailsOrder2 = await order2.getDetails();

            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(rewardAmount - comissionAmount)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order 1 Ever balance")
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order 2 Ever balance")
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on full filled 2', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE_SPENT1 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 2;

            TOKENS_TO_EXCHANGE_SPENT2 = 2;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 10;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderTst.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6),
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            let detailsOrder2 = await order2.getDetails();

            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order 1 Ever balance")
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order 2 Ever balance")
            expect(balanceFactoryTstStart.token.toString()).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on different filled: order 1 - full and 2 - part 1', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE_SPENT1 = 100;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 20;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 200;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderTst.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            let detailsOrder2 = await order2.getDetails();
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams();

            const rewardAmount = TOKENS_TO_EXCHANGE_RECEIVE1 * ((TOKENS_TO_EXCHANGE_SPENT1/TOKENS_TO_EXCHANGE_RECEIVE1)-(TOKENS_TO_EXCHANGE_RECEIVE2/TOKENS_TO_EXCHANGE_SPENT2));
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            console.log(`Reward amount: ${rewardAmount}`);
            console.log(`Comission amount: ${comissionAmount}`);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1*(TOKENS_TO_EXCHANGE_RECEIVE2/TOKENS_TO_EXCHANGE_SPENT2))).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(rewardAmount - comissionAmount)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(2).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(Number(await locklift.provider.getBalance(order2.address))).to.be.above(0, "Wrong Order Ever balance");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on different filled: order 1 - full and 2 - part 2', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE_SPENT1 = 0.9238;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 0.000009238;

            TOKENS_TO_EXCHANGE_SPENT2 = 49.751253018;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 4.768418;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderTst.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            let detailsOrder2 = await order2.getDetails();
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams();

            const expectedRecive = Number((TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_SPENT2*TOKENS_TO_EXCHANGE_RECEIVE2).toFixed(9));
            const rewardAmount = (TOKENS_TO_EXCHANGE_SPENT1 - (expectedRecive)).toFixed(9);
            const comissionAmount = Number(rewardAmount) * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            console.log(`Reward amount: ${rewardAmount}`);
            console.log(`Comission amount: ${comissionAmount.toFixed(9)}`);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount).toFixed(9)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(expectedRecive)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(Number(rewardAmount) - comissionAmount).toFixed(9,1)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(2).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(Number(await locklift.provider.getBalance(order2.address))).to.be.above(0, "Wrong Order Ever balance");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on different filled: order 1 - part and 2 - full', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE_SPENT1 = 100;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 1;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 9;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);
            let detailsOrder1 = await order1.getDetails();

            // Create Order 2
            const payload2 = await RootOrderTst.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            );

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6),
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            let detailsOrder2 = await order2.getDetails();

            // Call matching
            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, true);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams();

            const rewardAmount = (TOKENS_TO_EXCHANGE_SPENT2 * (TOKENS_TO_EXCHANGE_SPENT1/TOKENS_TO_EXCHANGE_RECEIVE1)) - (TOKENS_TO_EXCHANGE_RECEIVE2/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            console.log(`Reward amount: ${rewardAmount}`);
            console.log(`Comission amount: ${comissionAmount}`);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(rewardAmount - comissionAmount)).toString();

            let addressTst = new Address(detailsOrder1.spentWallet.toString());
            const LO1TstWallet = await TokenWallet.from_addr(addressTst, order1.address);
            let balanceLimitOrder1 = numberString(Number(await LO1TstWallet.balance()), tstDecimals);
            const expectedLO1Tst = numberString(TOKENS_TO_EXCHANGE_SPENT1-(TOKENS_TO_EXCHANGE_SPENT2*(TOKENS_TO_EXCHANGE_SPENT1/TOKENS_TO_EXCHANGE_RECEIVE1)), tstDecimals);

            expect(2).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(Number(await(locklift.provider.getBalance(order1.address)))).to.be.above(0, "Order 1 ever balance should be higher 0!");
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order 2 Ever balance")
            expect(expectedFactoryTstWallet).to.equal(new BigNumber(balanceFactoryTstEnd.token || 0).toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
            expect(expectedLO1Tst).to.equal(new BigNumber(balanceLimitOrder1).shiftedBy(-tstDecimals).toString(), 'Wrong Limit Order 1 Tst wallet balance');
        });
        it('Matching on full filled order from backend 1', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE_SPENT1 = 30;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 20;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, `0x${signer.publicKey}`
                )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ), {allowedCodes: {compute: [null]}});

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ),{allowedCodes: {compute: [null]}});

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.backendMatching(1, order2.address, true, true, signer)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams()
            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order Ever balance 2");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching on different filled: order 1 - full and 2 - part order from backend 2', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE_SPENT1 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 1;

            TOKENS_TO_EXCHANGE_SPENT2 = 2;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 10;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, `0x${signer.publicKey}`
                )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ), {allowedCodes: {compute: [null]}});

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ),{allowedCodes: {compute: [null]}});

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.backendMatching(1, order2.address, true, true, signer)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams()
            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedRecive = Number((TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_SPENT2*TOKENS_TO_EXCHANGE_RECEIVE2).toFixed(9));
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(expectedRecive)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(2).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(Number(await(locklift.provider.getBalance(order2.address)))).to.above(0, "Wrong Order Ever balance 2");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching on different filled: order 1 - full and 2 - full order from backend 3', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE_SPENT1 = 14;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 2;

            TOKENS_TO_EXCHANGE_SPENT2 = 2;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 6;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, `0x${signer.publicKey}`
                )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ), {allowedCodes: {compute: [null]}});

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ),{allowedCodes: {compute: [null]}});

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.backendMatching(1, order2.address, true, true, signer)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams()
            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedReceive = Number((TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_SPENT2*TOKENS_TO_EXCHANGE_RECEIVE2).toFixed(9));
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(expectedReceive)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order Ever balance 2");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching on different filled: order 1 - part and 2 - full order from backend 4', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE_SPENT1 = 14;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 4;

            TOKENS_TO_EXCHANGE_SPENT2 = 2;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 6;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, `0x${signer.publicKey}`
                )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ), {allowedCodes: {compute: [null]}});

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ),{allowedCodes: {compute: [null]}});

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.backendMatching(1, order2.address, true, true, signer)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams()

            const rewardAmount = (TOKENS_TO_EXCHANGE_SPENT2/TOKENS_TO_EXCHANGE_RECEIVE1)* TOKENS_TO_EXCHANGE_SPENT1 - (TOKENS_TO_EXCHANGE_SPENT2/TOKENS_TO_EXCHANGE_SPENT2)*TOKENS_TO_EXCHANGE_RECEIVE2;
            let comissionAmount = 0;

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();
            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            expect(2).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(3).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(Number(await(locklift.provider.getBalance(order1.address)))).to.above(0, "Wrong Order Ever balance 1");
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order2.address))), "Wrong Order Ever balance 2");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching on different filled: order 1 - full and 2 - part order from backend 5', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE_SPENT1 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 1;

            TOKENS_TO_EXCHANGE_SPENT2 = 5;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 5;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, `0x${signer.publicKey}`
                )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ), {allowedCodes: {compute: [null]}});

            const order1 = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order 1: ${order1.address}`);
            console.log(``);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, `0x${signer.publicKey}`
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ),{allowedCodes: {compute: [null]}});

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            console.log(`Limit order 2: ${order2.address}`);
            console.log(``);

            // Call matching
            await order1.backendMatching(1, order2.address, true, true, signer)

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, tstDecimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const feeParams = await RootOrderTst.feeParams()
            const rewardAmount = (TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_RECEIVE1)* TOKENS_TO_EXCHANGE_SPENT1 - (TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_SPENT2)*TOKENS_TO_EXCHANGE_RECEIVE2;
            let comissionAmount = 0;
            if (Number(feeParams.params.matchingNumerator) != 0 && Number(feeParams.params.matchingDenominator) != 0) {
                comissionAmount = rewardAmount * (Number(feeParams.params.matchingNumerator) / Number(feeParams.params.matchingDenominator));
            }

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber((TOKENS_TO_EXCHANGE_RECEIVE1/TOKENS_TO_EXCHANGE_SPENT2)*TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            expect(3).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(2).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await(locklift.provider.getBalance(order1.address))), "Wrong Order Ever balance 1");
            expect(Number(await(locklift.provider.getBalance(order2.address)))).to.above(0, "Wrong Order Ever balance 2");
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching order failure', async () => {
            console.log(`#############################\n`);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE_SPENT1 = 50;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 30;

            TOKENS_TO_EXCHANGE_SPENT2 = 20;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 100;

            //Create Order 1
            const payload1 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE1, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT1, tstDecimals), RootOrderTst.address, payload1, toNano(6)
            ));
            const order1 = await RootOrderTst.getEventCreateOrder(account3);

            console.log(order1.address);

            // Create Order 2
            const payload2 = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE_RECEIVE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE_SPENT2, barDecimals), RootOrderBar.address, payload2, toNano(6)
            ));

            const order2 = await RootOrderBar.getEventCreateOrder(account4);
            let detailsOrder2 = await order2.getDetails();

            console.log(order2.address);

            // Call matching
            await order1.matching(
                2, 0.1, RootOrderBar.address,
                detailsOrder2.owner, detailsOrder2.timeTx, detailsOrder2.nowTx,
                account5.address, true, false);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();

            expect(2).to.eq(Number(await order1.status()), 'Wrong status Limit Order 1');
            expect(2).to.eq(Number(await order2.status()), 'Wrong status Limit Order 2');

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(balanceBarAcc5Start.token.toString()).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(balanceTstAcc5Start.token.toString()).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
    });
    describe('Check callbacks and result', async() => {
        it('Order part filled with 1 buyers and get successPayloads', async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE2_ACC3 = 10;

            const payload = await RootOrderBar.buildPayloadRoot(
                123123, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0, ''
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6),
            ), {allowedCodes: {compute: [60,null]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);

            const successPayload4 = await order.originalPayloadSuccess(200,  555, account3.address);
            const cancelPayload4 = await order.originalPayloadSuccess(201,  555, account4.address);
            const payloadLO4 = await order.buildPayload(1, 0.1, account4.address, successPayload4, cancelPayload4)

            const expectPayload = await order.buildSuccessPayload(50, successPayload4, account4.address)
            const {traceTree} = await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO4, toNano(5)
            ), {allowedCodes: {compute: [60,null]}});

            await traceTree?.beautyPrint();

            const depositCalls = traceTree?.findCallsForContract({
                contract: barWallet4.contract,
                name: "acceptTransfer"
            });

            expect(depositCalls[0].payload.toString()).to.eq(expectPayload.toString(), "Fault payload success");
            expect(traceTree).to.call("acceptTransfer", barWallet4.address).withNamedArgs({
                amount: "5000000000",
                sender: order.address,
                remainingGasTo: account4.address.toString(),
                notify: true,
                payload: expectPayload.toString()
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();

            // @ts-ignore
            expect(2).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Order part filled with 1 buyers and get cancelPayloads', async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE2_ACC3 = 10;

            const payload = await RootOrderBar.buildPayloadRoot(
                123123, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0, ''
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6),
            ), {allowedCodes: {compute: [60,null]}});

            const order = await RootOrderBar.getEventCreateOrder(account3);

            const successPayload4 = await order.originalPayloadSuccess(200,  666, account3.address);
            const cancelPayload4 = await order.originalPayloadSuccess(201,  666, account4.address);
            const payloadLO4 = await order.buildPayload(1, 0.1, account4.address, successPayload4, cancelPayload4)

            const expectPayload = await order.buildCancelPayload(50, cancelPayload4)
            const { traceTree } = await locklift.tracing.trace(barWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, barDecimals), order.address, payloadLO4, toNano(5)
            ), {allowedCodes: {compute: [60,null]}});

            await traceTree?.beautyPrint();
            const depositCalls = traceTree?.findCallsForContract({
                contract: barWallet4.contract,
                name: "acceptTransfer"
            });

            expect(depositCalls[0].payload.toString()).to.eq(expectPayload.toString(), "Fault payload cancel");
            expect(traceTree).to.call("acceptTransfer", barWallet4.address).withNamedArgs({
                amount: "10000000000",
                sender: order.address,
                remainingGasTo: account4.address.toString(),
                notify: true,
                payload: expectPayload.toString()
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();

            // @ts-ignore
            expect(2).to.be.equal((Number(await order.status())), 'Wrong status Limit Order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3End.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4End.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4End.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Order root get cancelPayload from create order',  async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const cancelPayloadRoot = await RootOrderTst.originalPayloadCancel(22,  777, account3.address);

            const payload = await RootOrderTst.buildPayloadRoot(
                123123, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0, cancelPayloadRoot
            )

            const { traceTree } = await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, tstDecimals), RootOrderBar.address, payload, toNano(6),
            ), {allowedCodes: {compute: [60,null]}});

            const expectPayload = await RootOrderBar.buildCancelPayload(53, 201, cancelPayloadRoot);

            await traceTree?.beautyPrint();
            const depositCalls = traceTree?.findCallsForContract({
                contract: tstWallet3.contract,
                name: "acceptTransfer"
            });

            expect(depositCalls[0].payload.toString()).to.eq(expectPayload.toString(), "Fault payload cancel");
            expect(traceTree).to.call("acceptTransfer", tstWallet3.address).withNamedArgs({
                amount: "10000000000",
                sender: RootOrderBar.address,
                remainingGasTo: account3.address.toString(),
                notify: true,
                payload: expectPayload.toString()
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            // @ts-ignore
            expect(balanceBarAcc3End.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3End.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
        });
    });
    describe('Fee params Order', async () => {
        it('Check fee execution, case 1.1', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryStart, true, "Factory");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            NUMERATOR = 1;
            DENOMINATOR = 100;
            MATCHINGNUMERATOR = 0;
            MATCHINGDENOMINATOR = 0;

            let listRoots:Address[] = [RootOrderBar.address];
            await factoryOrder.setRootFeeParams(
                listRoots,
                NUMERATOR, DENOMINATOR, MATCHINGNUMERATOR, MATCHINGDENOMINATOR, zeroAddress, true
            )

            const feeParams = await RootOrderBar.feeParams()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ));

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload(1, 0.1)

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryEnd, true, "Factory");
            const fees =  new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))
            console.log(`FEE - ${fees}`)
            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC3))).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC4))).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedTstFactory = new BigNumber(balanceTstFactoryStart.token || 0).plus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
            expect(expectedTstFactory).to.equal(balanceTstFactoryEnd.token.toString(), 'Wrong Beneficiary balance');
        });
        it('Check fee execution, case 1.2 (Change Fee parameters)', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryStart, true, "Factory");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            NUMERATOR = 15;
            DENOMINATOR = 90;
            MATCHINGNUMERATOR = 0;
            MATCHINGDENOMINATOR = 0;

            let listRoots: Address[] = [RootOrderBar.address];
            await factoryOrder.setRootFeeParams(
                listRoots,
                NUMERATOR, DENOMINATOR, MATCHINGNUMERATOR, MATCHINGDENOMINATOR, zeroAddress, true
            )

            const feeParams = await RootOrderBar.feeParams()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ));

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload(1, 0.1)

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryEnd, false, "Factory");
            const fees =  new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))
            console.log(`FEE - ${fees}`)

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toFixed(8)
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(8)
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC3))).toFixed(8)
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toFixed(8)
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC4))).toFixed(8)
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toFixed(8)
            const expectedTstFactory = new BigNumber(balanceTstFactoryStart.token || 0).plus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(8)

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toFixed(8), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toFixed(8), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toFixed(8), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toFixed(8), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toFixed(8), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toFixed(8), 'Wrong Account5 Tst balance');
            expect(expectedTstFactory).to.equal(balanceTstFactoryEnd.token.toFixed(8), 'Wrong Beneficiary balance');
        });
        it('Check fee execution, case 1.3 (Withdraw fee)', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const newBeneficiary = account8

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryStart, true, "Factory");

            const balanceTstRecipientStart = await accountTokenBalances(tstWallet2, tstDecimals);
            await displayLog(0, balanceTstRecipientStart, true, "Recipient Balance");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            NUMERATOR = 1;
            DENOMINATOR = 100;
            MATCHINGNUMERATOR = 0;
            MATCHINGDENOMINATOR = 0;

            let listOrders : Address[] = [RootOrderBar.address];
            await factoryOrder.setRootFeeParams(
                listOrders,
                NUMERATOR, DENOMINATOR, MATCHINGNUMERATOR, MATCHINGDENOMINATOR, zeroAddress, true
            )

            const feeParams = await RootOrderBar.feeParams()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ));

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload(1, 0.1)

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            const fees =  new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))
            console.log(`FEE - ${fees}`)
            const FactoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0
            console.log("FactoryAddress - ", FactoryAddress)

            await factoryOrder.withdrawFee(
                new BigNumber(fees).shiftedBy(tstDecimals).toString(),
                account2.address,
                account1.address,
                FactoryAddress,
                0.1,
                true
            );

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryEnd, false, "Factory");

            const balanceTstRecipientEnd = await accountTokenBalances(tstWallet2, tstDecimals);
            await displayLog(0, balanceTstRecipientEnd, false, "Recipient Balance");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toFixed(9)
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(9)
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC3))).toFixed(9)
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toFixed(9)
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC4))).toFixed(9)
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toFixed(9)
            const expectedRecipientTst = new BigNumber(balanceTstRecipientStart.token || 0).plus(new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(9)
            const expectedTstFactory = new BigNumber(balanceTstFactoryStart.token || 0).toFixed(9)

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toFixed(9), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toFixed(9), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toFixed(9), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toFixed(9), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toFixed(9), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toFixed(9), 'Wrong Account5 Tst balance');
            expect(expectedTstFactory).to.equal(balanceTstFactoryEnd.token.toFixed(9), 'Wrong Beneficiary balance');
            expect(expectedRecipientTst).to.equal(balanceTstRecipientEnd.token.toFixed(9), 'Wrong Recipient balance');
        });
        it('Check fee execution, case 1.4 (Set beneficiary)', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            await displayLog((await accountTokenBalances(barWallet3, barDecimals)), (await accountTokenBalances(tstWallet3, tstDecimals)), true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, barDecimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, tstDecimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const newBeneficiary = account7

            const balanceTstFactoryStart = {token: new BigNumber(0)};
            await displayLog(0, 0, true, "Factory");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            NUMERATOR = 1;
            DENOMINATOR = 100;
            MATCHINGNUMERATOR = 0;
            MATCHINGDENOMINATOR = 0;

            let listOrders : Address[] = [RootOrderBar.address];

            await factoryOrder.setRootFeeParams(
                listOrders,
                NUMERATOR, DENOMINATOR, MATCHINGNUMERATOR, MATCHINGDENOMINATOR, zeroAddress, true
            )
            const feeParams = await RootOrderBar.feeParams()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');

            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            await factoryOrder.setRootFeeParams(
                listOrders,
                NUMERATOR, DENOMINATOR, MATCHINGNUMERATOR, MATCHINGDENOMINATOR, newBeneficiary.address, true
            )
            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenReceive.address, numberString(TOKENS_TO_EXCHANGE2, tstDecimals),
                0, 0
            )

            const newBeneficiaryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: newBeneficiary.address, answerId: 0}).call()).value0
            const newBeneficiaryWalletTst = await TokenWallet.from_addr(newBeneficiaryAddress, newBeneficiary, "newBeneficiaryWalletTst")
            await locklift.tracing.trace(barWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, barDecimals), RootOrderBar.address, payload, toNano(6)
            ));

            const order = await RootOrderBar.getEventCreateOrder(account3);
            const payloadLO = await order.buildPayload(1, 0.1)

            await locklift.tracing.trace(tstWallet4.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC3, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            await locklift.tracing.trace(tstWallet5.transfer(
                numberString(TOKENS_TO_EXCHANGE2_ACC4, tstDecimals), order.address, payloadLO, toNano(6)
            ));

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, tstDecimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, barDecimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(newBeneficiaryWalletTst, tstDecimals);
            await displayLog(0, balanceTstFactoryEnd, false, "Factory");

            const fees =  new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))
            console.log(`FEE - ${fees}`)
            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toFixed(9)
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(9)
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC3))).toFixed(9)
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toFixed(9)
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).minus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE1_ACC4))).toFixed(9)
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toFixed(9)
            const expectedTstFactory = new BigNumber(balanceTstFactoryStart.token || 0).plus( new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))).toFixed(9)

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toFixed(9), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toFixed(9), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toFixed(9), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toFixed(9), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toFixed(9), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toFixed(9), 'Wrong Account5 Tst balance');
            expect(expectedTstFactory).to.equal(balanceTstFactoryEnd.token.toFixed(9), 'Wrong Beneficiary balance');
        });
    });
    describe('Upgrade Order contracts', async () => {
        it('Check Order upgrade', async () => {
            console.log(`#############################\n`);

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = await RootOrderBar.buildPayloadRoot(
                0, zeroAddress, rootTokenBar.address, numberString(TOKENS_TO_EXCHANGE2, barDecimals),
                0, 0
            )

            await locklift.tracing.trace(tstWallet3.transfer(
                numberString(TOKENS_TO_EXCHANGE1, tstDecimals), RootOrderTst.address, payload, toNano(6)
            ));
            const order = await RootOrderTst.getEventCreateOrder(account3);
            console.log(`Limit order: ${order.address}`);
            console.log(``);
            console.log(`Upgrade Order...`)
            const NEW_VERSION = 3

            const testOrderCode = (await locklift.factory.getContractArtifacts("TestNewOrder")).code

            await factoryOrder.setOrderCode(testOrderCode)
            let orders:Address[] = [order.address];
            await factoryOrder.updateOrder(orders)

            const newOrder = await locklift.factory.getDeployedContract("TestNewOrder", order.address);
            const testMessage = (await newOrder.methods.newFunc().call()).value0;
            const newVersion = (await newOrder.methods.getDetails({answerId: 1}).call()).value0.version

            expect(testMessage).to.equal("New Order", "Wrong Upgrade OrderFactory")
            expect(newVersion.toString()).to.equal(NEW_VERSION.toString(), "Wrong Order new version")
        });
        it('Check Order Root upgrade', async () => {
            console.log(`#############################\n`);

            console.log(`Upgrade OrderRoot...`)
            const NEW_VERSION = 4

            const testFactoryCode = (await locklift.factory.getContractArtifacts("TestNewOrderRoot")).code
            await factoryOrder.setOrderRootCode(testFactoryCode)
            let roots:Address[] = [RootOrderBar.address];
            await factoryOrder.upgradeOrderRoot(roots)

            const newRoot = await locklift.factory.getDeployedContract("TestNewOrderRoot", RootOrderBar.address)
            const testMessage = (await newRoot.methods.newFunc().call()).value0;
            const newVersion = (await newRoot.methods.getVersion({answerId: 1}).call()).value0;

            expect(testMessage).to.equal("New Order Root", "Wrong Upgrade OrderFactory")
            expect(newVersion.toString()).to.equal(NEW_VERSION.toString(), "Wrong OrderFactory new version")
        });
        it('Check Order Factory upgrade', async () => {
            console.log(`#############################\n`);
            console.log(`Upgrade OrderFactory...`)

            const testFactoryCode = (await locklift.factory.getContractArtifacts("TestNewOrderFactory")).code
            const NEW_VERSION = 3
            await factoryOrder.upgrade(testFactoryCode, account1.address, NEW_VERSION)

            const newFactory = await locklift.factory.getDeployedContract("TestNewOrderFactory", factoryOrder.address)
            const testMessage = (await newFactory.methods.newFunc().call()).value0;
            const newVersion = (await newFactory.methods.getVersion({answerId: 1}).call()).value0;
            const owner = (await newFactory.methods.getOwner({answerId: 2}).call()).value0;

            expect(testMessage).to.equal("New Order Factory", "Wrong Upgrade OrderFactory")
            expect(newVersion.toString()).to.equal(NEW_VERSION.toString(), "Wrong OrderFactory new version")
            expect(owner.toString()).to.equal(account1.address.toString(), "Wrong OrderFactory owner");
        });
    });
});

async function accountTokenBalances(contract: any, decimals: any): Promise<{ token: BigNumber }> {
    let token: BigNumber;
    await contract.balance()
        .then(n => {
            token = new BigNumber(n).shiftedBy(- decimals);
        }).catch(e => {/*ignored*/
        });

    return {token}
}

async function displayLog(balanceBar: any, balanceTst: any, start: any, accountText: any) {
    console.log(` ${chalk.bold.blue(`${accountText} balance`)} ${start == true ? ' start: ' : ' end: '}` +
        `${chalk.green(`${balanceBar !== undefined ? balanceBar.token + ' BAR' : 'BAR'},`)}` +
        `${chalk.green(`${balanceTst !== undefined ? balanceTst.token + ' TST' : 'TST'}`)}`);
}

async function deployWallet(owner: Account, tokenRoot: Contract<FactorySource['TokenRootUpgradeable']>, rootOwner: Account, mintAmount: number = 500): Promise<Address> {
    await locklift.tracing.trace(tokenRoot.methods
        .deployWallet({
            answerId: 1,
            walletOwner: owner.address,
            deployWalletValue: toNano(7),
        })
        .send({amount: toNano(9), from: owner.address}));

    const address = await tokenRoot.methods
        .walletOf({answerId: 1, walletOwner: owner.address})
        .call();

    await locklift.tracing.trace(
        tokenRoot.methods.mint({
            amount: new BigNumber(mintAmount).shiftedBy(9).toString(),
            recipient: owner.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: false,
            payload: ''
        }).send({amount: toNano(2), from: rootOwner.address})
    )
    return address.value0;
}

function expectAmountFee(numerator: number, denominator: number, amount: number): number {
    const fee: number = (numerator/denominator) * amount;
    return fee
}

function numberString(amount: number, decimals: number): string {
    return new BigNumber(amount).shiftedBy(decimals).toString();
}
