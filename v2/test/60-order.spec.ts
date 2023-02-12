import {Address, Contract, getRandomNonce, zeroAddress} from 'locklift';
import {FactorySource} from '../../build/factorySource';
//@ts-ignore
import {Constants} from '../../scripts/utils';
import {accountMigration, tokenRootMigration, logMigrationSuccess,} from '../../v2/utils';
import {expect, valueOf} from 'chai';
import {Account} from 'everscale-standalone-client/nodejs';
import {
    dexAccountMigration,
    dexPairMigration,
    dexRootMigration, dexVaultMigration,
    orderFactoryMigration,
    orderRootMigration, tokenFactoryMigration
} from "../utils/migration.new.utils";
import BigNumber from "bignumber.js";
import {OrderWrapper} from "../utils/wrappers/order";
import {TokenWallet} from "../utils/wrappers/tokenWallet";
import chalk from "chalk";

describe('OrderTest', () => {
    const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';

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

    let factoryOrder: Contract<FactorySource['OrderFactory']>;
    let RootOrderBar: Contract<FactorySource['OrderRoot']>;
    let RootOrderTst: Contract<FactorySource['OrderRoot']>;
    let Order: Contract<FactorySource['Order']>;

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
    
    let FactoryWalletTst: TokenWallet;

    let account7: Account;
    let account8: Account;

    let tokenFactory: Contract<FactorySource['TokenFactory']>;
    let dexVault: Contract<FactorySource['DexVault']>;
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

        const dexRoot = await dexRootMigration(account1);
        dexVault = await dexVaultMigration(account1, dexRoot, tokenFactory);
        dexAccount = await dexAccountMigration(account1, dexRoot);

        rootTokenBar = await tokenRootMigration(
            'BarRoot',
            'BAR',
            9,
            account1
        );
        rootTokenReceive = await tokenRootMigration(
            'TstRoot',
            'TST',
            9,
            account1
        );

        const wallet1Address = await deployWallet(account1, rootTokenReceive, account1, 3000)
        const wallet1 = await TokenWallet.from_addr(wallet1Address, account1, 'wallet1');

        const wallet2Address = await deployWallet(account1, rootTokenBar, account1, 3000)
        const wallet2 = await TokenWallet.from_addr(wallet2Address, account1, 'wallet2');

        factoryOrder = await orderFactoryMigration(account1, 1, dexRoot, 0, 0, 0 ,0);
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
                    amount: locklift.utils.toNano(9), from: account1.address
                }), {allowedCodes: {compute: [100]}}
        )
        await
            locklift.tracing.trace(wallet1.transfer(
                new BigNumber(2000).shiftedBy(Constants.tokens.bar.decimals).toString(),
                dexAccount.address,
                EMPTY_TVM_CELL,
                locklift.utils.toNano(3),
                )
            )
        await wallet2.transfer(
                new BigNumber(2000).shiftedBy(Constants.tokens.bar.decimals).toString(),
                dexAccount.address,
                EMPTY_TVM_CELL,
                locklift.utils.toNano(3))

        RootOrderBar = await orderRootMigration(account1, factoryOrder, rootTokenBar)
        RootOrderTst = await orderRootMigration(account2, factoryOrder, rootTokenReceive)

        await locklift.tracing.trace(rootTokenBar.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: locklift.utils.toNano(7),
            })
            .send({amount: locklift.utils.toNano(9), from: account1.address}));

        await locklift.tracing.trace(rootTokenReceive.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: locklift.utils.toNano(7),
            })
            .send({amount: locklift.utils.toNano(9), from: account1.address}));

        await locklift.tracing.trace(
            dexAccount.methods.depositLiquidity({
                call_id: getRandomNonce(),
                left_root: rootTokenBar.address,
                left_amount: new BigNumber(200).shiftedBy(Constants.tokens.bar.decimals).toString(),
                right_root: rootTokenReceive.address,
                right_amount: new BigNumber(2000).shiftedBy(Constants.tokens.tst.decimals).toString(),
                expected_lp_root: lproot.lp,
                auto_change: true,
                send_gas_to: account1.address
            }).send({amount: locklift.utils.toNano(4), from: account1.address})
        )

        const barWallet2Address = await deployWallet(account2, rootTokenBar, account1)
        barWallet2 = await TokenWallet.from_addr(barWallet2Address, account2, 'barWallet2');

        const tstWallet2Address = await deployWallet(account2, rootTokenReceive, account1)
        tstWallet2  = await TokenWallet.from_addr(tstWallet2Address, account2, 'tstWallet2');

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

        const feesBar = await RootOrderBar.methods.getFeeParams({answerId: 0}).call()
        console.log(`Beneficary = ${feesBar.params.beneficiary}\nFee - ${feesBar.params.numerator}/${feesBar.params.denominator}/
        ${feesBar.params.matchingNumerator}/${feesBar.params.matchingDenominator}`);

        const feesTst = await RootOrderTst.methods.getFeeParams({answerId: 0}).call()
        console.log(`Beneficary = ${feesTst.params.beneficiary}\nFee - ${feesTst.params.numerator}/${feesTst.params.denominator}/
        ${feesTst.params.matchingNumerator}/${feesTst.params.matchingDenominator}`)
    });

    describe('Direct execution Order', async () => {
        it('Check full execution, case 1.1', async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0,
            }).call()).value0;

            await locklift.tracing.trace(barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(5),
            ), {allowedCodes: {compute: [60]}})

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)

            const order = await OrderWrapper.from_addr(orderAddress, account3)
            const payloadLO = await order.buildPayload(1, 0.1)

            await locklift.tracing.trace(tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                order.address,
                payloadLO,
                locklift.utils.toNano(6)
            ), {allowedCodes: {compute: [60]}})

            await locklift.tracing.trace(tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                order.address,
                payloadLO,
                locklift.utils.toNano(6)
            ), {allowedCodes: {compute: [60]}})


            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Check partial execution Order, case 2.2', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 5;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 10;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: "1",
                deployWalletValue: locklift.utils.toNano(0.1)
            }).call();

            await locklift.tracing.trace(tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(4)
            ), {allowedCodes: {compute: [60]}})

            await locklift.tracing.trace(tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(4)
            ), {allowedCodes: {compute: [60]}})

            await locklift.tracing.trace(tstWallet6.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(4)
            ), {allowedCodes: {compute: [60]}})

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC5)).toString();

            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
            expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Account6 Bar balance');
            expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Account6 Tst balance');
        });
        it('Check partial execution Order, case 2.3', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 10;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 20;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6),
            )
            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: "1",
                deployWalletValue: locklift.utils.toNano(0.1)
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(3)
            )

            await tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(3)
            )

            await tstWallet6.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(3)
            )

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1_ACC5 - 5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC5 - 10)).toString();

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
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            await Order.methods.cancel({callbackId: 0}).send({
                amount: locklift.utils.toNano(1), from: account3.address
            })

            const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const orderBalance = await locklift.provider.getBalance(Order.address);

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
            expect(orderBalance.toString()).to.equal("0", "Wrong Order Ever balance")
        });
        it('Check create order and closed, case 3.2', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            TOKENS_TO_EXCHANGE2_ACC3 = 10;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            const payloadLO = await Order.methods.buildPayload({
                callbackId: "1",
                deployWalletValue: locklift.utils.toNano(0.1)
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(3)
            )

            await Order.methods.cancel({callbackId: 0}).send({
                amount: locklift.utils.toNano(3), from: account3.address
            })

            const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()
            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();

            const orderBalance = await locklift.provider.getBalance(Order.address);

            expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(orderBalance.toString()).to.equal("0", "Wrong Order Ever balance")
        });
        it('Check execution closed order, case 4.1', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 15;
            TOKENS_TO_EXCHANGE2 = 30;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            pastEvents.events.forEach(event => {
                // @ts-ignore
                console.log(`address - ${event.data.order}\ncreated_at - ${event.data.createdAt}`)
            })
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            const payloadLO = await Order.methods.buildPayload({
                callbackId: "1",
                deployWalletValue: locklift.utils.toNano(0.1)
            }).call();

            await Order.methods.cancel({callbackId: 0}).send({
                amount: locklift.utils.toNano(1), from: account3.address
            })

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(3)
            )
            const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
        });
    });
    describe('Execution order via DEX', async () => {
        it('Order from backend SUCCESS', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const signer = await locklift.keystore.getSigner("3");
            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: `0x${signer.publicKey}`,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            console.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);
            await Order.methods.backendSwap({callbackId: 1}).sendExternal({publicKey: signer.publicKey})

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals))).toString();

            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Order from backend CANCEL', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 100;
            const signer = await locklift.keystore.getSigner("3");

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: `0x${signer.publicKey}`,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            console.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            await Order.methods.backendSwap({callbackId: 1}).send({
                amount: locklift.utils.toNano(2), from: account3.address
            })

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()

            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(stateL0.value0.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
        });
        it('Order from user SUCCESS', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.2),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            const order = await OrderWrapper.from_addr(orderAddress, account3)
            // const state = await order.status()
            // console.log(state.value0);

            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            console.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            await locklift.tracing.trace(order.swap(1, 0.1, true, account4.address), {allowedCodes:{compute:[60]}});

            const stateLO2 = await order.status()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus( new BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals)).minus(new BigNumber(TOKENS_TO_EXCHANGE2))).toString();

            //expect(stateLO2.value0.toNumver()).to.equal(new BigNumber(3).toString(), 'Wrong status Limit order');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Order from user CANCEL', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 100;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.2),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            const expected = await dexPair.methods.expectedExchange({
                answerId: 1,
                amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                spent_token_root: rootTokenBar.address
            }).call()

            console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            console.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            console.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            await locklift.tracing.trace(Order.methods.swap({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1)
            }).send({
                amount: locklift.utils.toNano(5), from: account3.address
            }), {allowedCodes:{compute:[60,302]}});

            const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus( new BigNumber(TOKENS_TO_EXCHANGE1)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(stateLO2.value0.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
        });
    });
    describe('Emergency mode', async () => {
        it('Emergency mode on, send TIP3, off', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const signer1 = await locklift.keystore.getSigner("1");
            await factoryOrder.methods.setEmergency({
                enabled: true,
                orderAddress: Order.address,
                manager: `0x${signer1.publicKey}`
            }).send({
                amount: locklift.utils.toNano(1),
                from: account1.address
            });

            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call()
            expect(stateLO1.value0.toString()).to.equal(new BigNumber(6).toString(), 'Wrong status Limit order');

            const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
                walletOwner: Order.address,
                answerId: 1
            }).call()
            await Order.methods.proxyTokensTransfer({
                _tokenWallet: tokenWalletBarToken.value0,
                _gasValue: locklift.utils.toNano(0.4),
                _amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                _recipient: account3.address,
                _deployWalletValue: 0,
                _remainingGasTo: account1.address,
                _notify: true,
                _payload: EMPTY_TVM_CELL
            }).sendExternal({publicKey: signer1.publicKey});

            await factoryOrder.methods.setEmergency({
                enabled: false,
                orderAddress: Order.address,
                manager: `0x${signer1.publicKey}`
            }).send({
                amount: locklift.utils.toNano(1), from: account1.address
            })

            const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()
            expect(stateLO2.value0.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            // @ts-ignore
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
        it('Emergency mode on, send TIP3, off (Bad OrderClosed contract)', async () => {
            console.log(`#############################`);
            console.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const BadOrderCode = (await locklift.factory.getContractArtifacts('TestNewOrderBad')).code

            await factoryOrder.methods.setOrderCode({_orderCode: BadOrderCode}).send({
                amount: locklift.utils.toNano(1),
                from: account1.address
            });

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            await factoryOrder.methods.upgradeOrder({order: orderAddress}).send({
                amount: locklift.utils.toNano(5),
                from: account1.address
            });
            Order = await locklift.factory.getDeployedContract("TestNewOrderBad", orderAddress)

            await Order.methods.cancel({callbackId: 15}).send({
                amount: locklift.utils.toNano(3),
                from: account3.address
            });

            const balanceBarAcc3Proccess = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            expect(balanceBarAcc3Proccess.token.toString()).to.equal(balanceBarAcc3Start.token.minus(TOKENS_TO_EXCHANGE1).toString(), 'Wrong Account3 Bar balance');
            const signer1 = await locklift.keystore.getSigner("1");
            await factoryOrder.methods.setEmergency({
                enabled: true,
                orderAddress: Order.address,
                manager: `0x${signer1.publicKey}`
            }).send({
                amount: locklift.utils.toNano(1),
                from: account1.address
            });

            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call()
            expect(stateLO1.value0.toString()).to.equal(new BigNumber(6).toString(), 'Wrong status Limit order');

            const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
                walletOwner: Order.address,
                answerId: 1
            }).call()
            await Order.methods.proxyTokensTransfer({
                _tokenWallet: tokenWalletBarToken.value0,
                _gasValue: locklift.utils.toNano(0.4),
                _amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                _recipient: account3.address,
                _deployWalletValue: 0,
                _remainingGasTo: account1.address,
                _notify: true,
                _payload: EMPTY_TVM_CELL
            }).sendExternal({publicKey: signer1.publicKey});


            const GasAccount3 = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9)
            const GasOrder = new BigNumber(await locklift.provider.getBalance(Order.address)).shiftedBy(-9)
            console.log(`GasAccount3 - ${GasAccount3.toString()}\nGasOrder - ${GasOrder.toString()}`)

            await locklift.tracing.trace(Order.methods.sendGas({
                to: account3.address,
                _value: locklift.utils.toNano(GasOrder.minus(1).toString()),
                _flag: 66,

            }).sendExternal({publicKey: signer1.publicKey}));

            await factoryOrder.methods.setEmergency({
                enabled: false,
                orderAddress: Order.address,
                manager: `0x${signer1.publicKey}`
            }).send({
                amount: locklift.utils.toNano(1), from: account1.address
            })

            const GasAccount3End = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9)
            console.log(GasAccount3End.minus(GasAccount3).toString())
            console.log(GasOrder.minus(1).toString())
            const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()
            expect(stateLO2.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
            expect(GasAccount3End.minus(GasAccount3).plus(0.3).isGreaterThanOrEqualTo(GasOrder.minus(1))).to.equal(true, 'Wrong gas Balance');

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            // @ts-ignore
            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        });
    });
    describe('Matching orders', async  () => {
        it('Matching on full filled order', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({
                root: RootOrderTst.address,
                params: {
                    numerator: 0,
                    denominator: 0,
                    matchingNumerator: 1,
                    matchingDenominator:4,
                    beneficiary: zeroAddress}
            }).send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const matchingNumerator = 1;
            const matchingDenominator = 4;
            const feeParams = await RootOrderTst.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal('0', 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal('0', 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(matchingNumerator.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(matchingDenominator.toString(), 'Wrong MATCHINGDENOMINATOR');

            TOKENS_TO_EXCHANGE_SPENT1 = 30;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 20;

            //Create Order 1
            const payload1 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenBar.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;


            await tstWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT1).shiftedBy(Constants.tokens.tst.decimals).toString(),
                RootOrderTst.address,
                payload1,
                locklift.utils.toNano(6)
            )

            const pastEvents1 = await RootOrderTst.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress1 = pastEvents1.events[0].data.order
            console.log(`Order 1 - ${orderAddress1}`)

            // Create Order 2
            const payload2 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT2).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload2,
                locklift.utils.toNano(6),
            )

            const pastEvents2 = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress2 = pastEvents2.events[0].data.order
            console.log(`Order 2 - ${orderAddress2}`)

            // Call matching
            Order = await locklift.factory.getDeployedContract("Order", orderAddress1);

            await locklift.tracing.trace(Order.methods.matching({
                callbackId: 2,
                deployWalletValue: locklift.utils.toNano(0.1),
                limitOrder: orderAddress2
            }).send({
                amount: locklift.utils.toNano(10), from: account5.address
            }), {allowedCodes:{compute:[60]}});
            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call();

            Order = await locklift.factory.getDeployedContract("Order", orderAddress2);
            const stateLO2 = await Order.methods.currentStatus({answerId: 2}).call();

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (matchingNumerator / matchingDenominator);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(rewardAmount - comissionAmount)).toString();

            expect(stateLO1.value0.toString()).to.eq(new BigNumber(3).toString(), 'Wrong status Limit Order 1');
            expect(stateLO2.value0.toString()).to.eq(new BigNumber(3).toString(), 'Wrong status Limit Order 2');
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on part filled order', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({
                root: RootOrderTst.address,
                params: {
                    numerator: 0,
                    denominator: 0,
                    matchingNumerator: 1,
                    matchingDenominator:4,
                    beneficiary: zeroAddress}
            }).send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const matchingNumerator = 1;
            const matchingDenominator = 4;
            const feeParams = await RootOrderTst.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal('0', 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal('0', 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(matchingNumerator.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(matchingDenominator.toString(), 'Wrong MATCHINGDENOMINATOR');

            TOKENS_TO_EXCHANGE_SPENT1 = 100;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 25;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 200;

            //Create Order 1
            const payload1 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenBar.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await tstWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT1).shiftedBy(Constants.tokens.tst.decimals).toString(),
                RootOrderTst.address,
                payload1,
                locklift.utils.toNano(6)
            )

            const pastEvents1 = await RootOrderTst.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress1 = pastEvents1.events[0].data.order
            console.log(`Order 1 - ${orderAddress1}`)

            // Create Order 2
            const payload2 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT2).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload2,
                locklift.utils.toNano(6)
            )

            const pastEvents2 = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress2 = pastEvents2.events[0].data.order
            console.log(`Order 2 - ${orderAddress2}`)

            // Call matching
            Order = await locklift.factory.getDeployedContract("Order", orderAddress1);

            await locklift.tracing.trace(Order.methods.matching({
                callbackId: 2,
                deployWalletValue: locklift.utils.toNano(0.1),
                limitOrder: orderAddress2
            }).send({
                amount: locklift.utils.toNano(10), from: account5.address
            }), {allowedCodes:{compute:[60]}});
            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call();

            Order = await locklift.factory.getDeployedContract("Order", orderAddress2);
            const stateLO2 = await Order.methods.currentStatus({answerId: 2}).call();

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const expectedAmountExchange = (TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2;
            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - expectedAmountExchange;
            const comissionAmount = rewardAmount * (matchingNumerator / matchingDenominator);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(comissionAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(expectedAmountExchange)).toString();

            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).plus(new BigNumber(rewardAmount - comissionAmount)).toString();

            expect(stateLO1.value0.toString()).to.eq(new BigNumber(3).toString(), 'Wrong status Limit Order 1');
            expect(stateLO2.value0.toString()).to.eq(new BigNumber(2).toString(), 'Wrong status Limit Order 2');
            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
        it('Matching on full filled order from backend', async () => {
            console.log(`#############################\n`);
            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({
                root: RootOrderTst.address,
                params: {
                    numerator: 0,
                    denominator: 0,
                    matchingNumerator: 1,
                    matchingDenominator:4,
                    beneficiary: zeroAddress}
            }).send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const matchingNumerator = 1;
            const matchingDenominator = 4;
            const feeParams = await RootOrderTst.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal('0', 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal('0', 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(matchingNumerator.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(matchingDenominator.toString(), 'Wrong MATCHINGDENOMINATOR');

            TOKENS_TO_EXCHANGE_SPENT1 = 30;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 10;

            TOKENS_TO_EXCHANGE_SPENT2 = 10;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 20;

            const signer = await locklift.keystore.getSigner("3");

            //Create Order 1
            const payload1 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenBar.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: `0x${signer.publicKey}`,
            }).call()).value0;

            await tstWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT1).shiftedBy(Constants.tokens.tst.decimals).toString(),
                RootOrderTst.address,
                payload1,
                locklift.utils.toNano(6)
            )

            const pastEvents1 = await RootOrderTst.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress1 = pastEvents1.events[0].data.order
            console.log(`Order 1 - ${orderAddress1}`)

            // Create Order 2
            const payload2 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: `0x${signer.publicKey}`
            }).call()).value0;

            await barWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT2).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload2,
                locklift.utils.toNano(6)
            )

            const pastEvents2 = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress2 = pastEvents2.events[0].data.order
            console.log(`Order 2 - ${orderAddress2}`)

            // Call matching
            Order = await locklift.factory.getDeployedContract("Order", orderAddress1);
            await locklift.tracing.trace(Order.methods.backendMatching(
                {
                    callbackId: 1,
                    limitOrder: orderAddress2
                }).sendExternal({publicKey: signer.publicKey}), {allowedCodes:{compute: [null,60]}});

            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call();

            Order = await locklift.factory.getDeployedContract("Order", orderAddress2);
            const stateLO2 = await Order.methods.currentStatus({answerId: 2}).call();

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const rewardAmount = TOKENS_TO_EXCHANGE_SPENT1 - ((TOKENS_TO_EXCHANGE_RECEIVE1*TOKENS_TO_EXCHANGE_RECEIVE2)/TOKENS_TO_EXCHANGE_SPENT2);
            const comissionAmount = rewardAmount * (matchingNumerator / matchingDenominator);

            const expectedFactoryTstWallet = new BigNumber(balanceFactoryTstStart.token || 0).plus(new BigNumber(rewardAmount)).toString();

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus(new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2)).toString();

            expect(stateLO1.value0.toString()).to.eq(new BigNumber(3).toString(), 'Wrong status Limit Order 1');
            expect(stateLO2.value0.toString()).to.eq(new BigNumber(3).toString(), 'Wrong status Limit Order 2');

            expect(expectedFactoryTstWallet).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Matching order failure', async () => {
            console.log(`#############################\n`);

            const factoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0;
            const factoryWalletTst = await TokenWallet.from_addr(factoryAddress, factoryOrder.address, "factoryWalletTst");
            const balanceFactoryTstStart = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);

            await displayLog(0, balanceFactoryTstStart, true, "Factory");

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({
                root: RootOrderTst.address,
                params: {
                    numerator: 0,
                    denominator: 0,
                    matchingNumerator: 1,
                    matchingDenominator:4,
                    beneficiary: zeroAddress}
            }).send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const matchingNumerator = 1;
            const matchingDenominator = 4;
            const feeParams = await RootOrderTst.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal('0', 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal('0', 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(matchingNumerator.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(matchingDenominator.toString(), 'Wrong MATCHINGDENOMINATOR');

            TOKENS_TO_EXCHANGE_SPENT1 = 50;
            TOKENS_TO_EXCHANGE_RECEIVE1 = 30;

            TOKENS_TO_EXCHANGE_SPENT2 = 20;
            TOKENS_TO_EXCHANGE_RECEIVE2 = 100;

            //Create Order 1
            const payload1 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenBar.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await tstWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT1).shiftedBy(Constants.tokens.tst.decimals).toString(),
                RootOrderTst.address,
                payload1,
                locklift.utils.toNano(6)
            )
            const pastEvents1 = await RootOrderTst.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress1 = pastEvents1.events[0].data.order
            console.log(`Order 1 - ${orderAddress1}`)

            // Create Order 2
            const payload2 = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE_RECEIVE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE_SPENT2).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload2,
                locklift.utils.toNano(6)
            )

            const pastEvents2 = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});

            // @ts-ignore
            const orderAddress2 = pastEvents2.events[0].data.order
            console.log(`Order 2 - ${orderAddress2}`)

            // Call matching
            Order = await locklift.factory.getDeployedContract("Order", orderAddress1);

            await locklift.tracing.trace(Order.methods.matching({
                callbackId: 2,
                deployWalletValue: locklift.utils.toNano(0.1),
                limitOrder: orderAddress2
            }).send({
                amount: locklift.utils.toNano(10), from: account5.address
            }));
            const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call();

            Order = await locklift.factory.getDeployedContract("Order", orderAddress2);
            const stateLO2 = await Order.methods.currentStatus({answerId: 2}).call();

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceFactoryTstEnd = await accountTokenBalances(factoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceFactoryTstEnd, false, "Factory");

            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT1)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).minus(new BigNumber(TOKENS_TO_EXCHANGE_SPENT2)).toString();

            expect(stateLO1.value0.toString()).to.eq(new BigNumber(2).toString(), 'Wrong status Limit Order 1');
            expect(stateLO2.value0.toString()).to.eq(new BigNumber(2).toString(), 'Wrong status Limit Order 2');
            expect(balanceFactoryTstStart.token.toString()).to.equal(balanceFactoryTstEnd.token.toString(), 'Wrong Factory Tst balance');

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');

            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');

            expect(balanceBarAcc5Start.token.toString()).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
            expect(balanceTstAcc5Start.token.toString()).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
        });
    });
    describe('Fee params Order', async () => {
        it('Check fee execution, case 1.1', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
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

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({root: RootOrderBar.address, params: {numerator: NUMERATOR, denominator: DENOMINATOR, matchingNumerator: MATCHINGNUMERATOR, matchingDenominator:MATCHINGDENOMINATOR, beneficiary: zeroAddress}})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const feeParams = await RootOrderBar.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;
            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1),
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )


            await tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )


            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
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
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
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

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({root: RootOrderBar.address, params: {numerator: NUMERATOR, denominator: DENOMINATOR, matchingNumerator: MATCHINGNUMERATOR, matchingDenominator:MATCHINGDENOMINATOR, beneficiary: zeroAddress}})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const feeParams = await RootOrderBar.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            )

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1),
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )

            await tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
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
        it('Check fee execution, case 1.3 (Withdraw fee)', async () => {
            console.log(`#############################\n`);

            let amount = await barWallet3.balance();
            console.log(`BALANCE _ ${amount}`)
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");

            const newBeneficiary = account8

            const balanceTstFactoryStart = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceTstFactoryStart, true, "Factory");

            const balanceTstRecipientStart = await accountTokenBalances(tstWallet2, Constants.tokens.tst.decimals);
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

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({root: RootOrderBar.address, params: {numerator: NUMERATOR, denominator: DENOMINATOR, matchingNumerator: MATCHINGNUMERATOR, matchingDenominator:MATCHINGDENOMINATOR, beneficiary: zeroAddress}})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const feeParams = await RootOrderBar.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await locklift.tracing.trace(barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            ))

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1),
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )

            await tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )
            const fees =  new BigNumber(expectAmountFee(NUMERATOR, DENOMINATOR, TOKENS_TO_EXCHANGE2))
            console.log(`FEE - ${fees}`)
            const FactoryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: factoryOrder.address, answerId: 0}).call()).value0
            console.log("FactoryAddress - ", FactoryAddress)

            await locklift.tracing.trace(factoryOrder.methods.withdrawFee({
                amount: new BigNumber(fees).shiftedBy(Constants.tokens.tst.decimals).toString(),
                recipient: account2.address,
                deployWalletValue: locklift.utils.toNano(0.1),
                tokenWallet: FactoryAddress,
                sendGasTo: account1.address
            }).send({amount: locklift.utils.toNano(2), from: account1.address}),{allowedCodes: {compute: [60]}})

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(FactoryWalletTst, Constants.tokens.tst.decimals);
            await displayLog(0, balanceTstFactoryEnd, false, "Factory");

            const balanceTstRecipientEnd = await accountTokenBalances(tstWallet2, Constants.tokens.tst.decimals);
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
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
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

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({root: RootOrderBar.address, params: {numerator: NUMERATOR, denominator: DENOMINATOR, matchingNumerator: MATCHINGNUMERATOR, matchingDenominator:MATCHINGDENOMINATOR, beneficiary: zeroAddress}})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const feeParams = await RootOrderBar.methods.getFeeParams({answerId: 1}).call()
            expect(feeParams.params.numerator).to.equal(NUMERATOR.toString(), 'Wrong NUMERATOR');
            expect(feeParams.params.denominator).to.equal(DENOMINATOR.toString(), 'Wrong DENOMINATOR');
            expect(feeParams.params.matchingNumerator).to.equal(MATCHINGNUMERATOR.toString(), 'Wrong MATCHINGNUMERATOR');
            expect(feeParams.params.matchingDenominator).to.equal(MATCHINGDENOMINATOR.toString(), 'Wrong MATCHINGDENOMINATOR');

            await locklift.tracing.trace(factoryOrder.methods.setRootFeeParams({params: {beneficiary: newBeneficiary.address, numerator: NUMERATOR, denominator: DENOMINATOR, matchingNumerator: MATCHINGNUMERATOR, matchingDenominator:MATCHINGDENOMINATOR}, root: RootOrderBar.address}).send({from: account1.address, amount: locklift.utils.toNano(0.2)}))
            const payload = (await RootOrderBar.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenReceive.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            const newBeneficiaryAddress = (await rootTokenReceive.methods.walletOf({walletOwner: newBeneficiary.address, answerId: 0}).call()).value0
            const newBeneficiaryWalletTst = await TokenWallet.from_addr(newBeneficiaryAddress, newBeneficiary, "newBeneficiaryWalletTst")
            await locklift.tracing.trace(barWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                RootOrderBar.address,
                payload,
                locklift.utils.toNano(6)
            ));

            const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)
            const payloadLO = await Order.methods.buildPayload({
                callbackId: 1,
                deployWalletValue: locklift.utils.toNano(0.1),
            }).call();

            await tstWallet4.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )

            await tstWallet5.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                Order.address,
                payloadLO.value0,
                locklift.utils.toNano(6)
            )

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceTstFactoryEnd = await accountTokenBalances(newBeneficiaryWalletTst, Constants.tokens.tst.decimals);
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

            const payload = (await RootOrderTst.methods.buildPayload({
                callbackId: 0,
                tokenReceive: rootTokenBar.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.bar.decimals).toString(),
                deployWalletValue: locklift.utils.toNano(0.1),
                backPK: 0,
                backMatchingPK: 0
            }).call()).value0;

            await tstWallet3.transfer(
                new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.tst.decimals).toString(),
                RootOrderTst.address,
                payload,
                locklift.utils.toNano(6)
            )
            const pastEvents = await RootOrderTst.getPastEvents({filter: event => event.event === "CreateOrder"});
            // @ts-ignore
            const orderAddress = pastEvents.events[0].data.order
            console.log(`Order - ${orderAddress}`)
            Order = await locklift.factory.getDeployedContract("Order", orderAddress)

            console.log(`Upgrade Order...`)
            const NEW_VERSION = 3

            const testOrderCode = (await locklift.factory.getContractArtifacts("TestNewOrder")).code
            await locklift.tracing.trace(factoryOrder.methods.setOrderCode({_orderCode: testOrderCode})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            await locklift.tracing.trace(factoryOrder.methods.upgradeOrder({order: Order.address})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const newOrder = await locklift.factory.getDeployedContract("TestNewOrder", Order.address)
            // @ts-ignore
            const testMessage = (await newOrder.methods.newFunc().call()).value0
            // @ts-ignore
            const newVersion = (await newOrder.methods.getDetails({answerId: 1}).call()).value0.version

            expect(testMessage).to.equal("New Order", "Wrong Upgrade OrderFactory")
            expect(newVersion.toString()).to.equal(NEW_VERSION.toString(), "Wrong Order new version")
        });
        it('Check Order Root upgrade', async () => {
            console.log(`#############################\n`);

            console.log(`Upgrade OrderRoot...`)
            const NEW_VERSION = 2

            const testFactoryCode = (await locklift.factory.getContractArtifacts("TestNewOrderRoot")).code
            await locklift.tracing.trace(factoryOrder.methods.setOrderRootCode({_orderRootCode: testFactoryCode})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            await locklift.tracing.trace(factoryOrder.methods.upgradeOrderRoot({orderAddress: RootOrderBar.address})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const newRoot = await locklift.factory.getDeployedContract("TestNewOrderRoot", RootOrderBar.address)
            // @ts-ignore
            const testMessage = (await newRoot.methods.newFunc().call()).value0;
            // @ts-ignore
            const newVersion = (await newRoot.methods.getVersion({answerId: 1}).call()).value0;

            expect(testMessage).to.equal("New Order Root", "Wrong Upgrade OrderFactory")
            expect(newVersion.toString()).to.equal(NEW_VERSION.toString(), "Wrong OrderFactory new version")
        });
        it('Check Order Factory upgrade', async () => {
            console.log(`#############################\n`);

            console.log(`Upgrade OrderFactory...`)

            const testFactoryCode = (await locklift.factory.getContractArtifacts("TestNewOrderFactory")).code
            const NEW_VERSION = 3
            await locklift.tracing.trace(factoryOrder.methods.upgrade({newCode: testFactoryCode, sendGasTo: account1.address, newVersion: NEW_VERSION})
                .send({amount: locklift.utils.toNano(1.1), from: account1.address}))

            const newFactory = await locklift.factory.getDeployedContract("TestNewOrderFactory", factoryOrder.address)
            // @ts-ignore
            const testMessage = (await newFactory.methods.newFunc().call()).value0;
            // @ts-ignore
            const newVersion = (await newFactory.methods.getVersion({answerId: 1}).call()).value0;
            // @ts-ignore
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

async function deployWallet(owner: Account, tokenRoot: Contract<FactorySource['TokenRootUpgradeable']>, rootOwner: Account, mintAmount: number = 190): Promise<Address> {
    await locklift.tracing.trace(tokenRoot.methods
        .deployWallet({
            answerId: 1,
            walletOwner: owner.address,
            deployWalletValue: locklift.utils.toNano(7),
        })
        .send({amount: locklift.utils.toNano(9), from: owner.address}));

    const address = await tokenRoot.methods
        .walletOf({answerId: 1, walletOwner: owner.address})
        .call();

    await locklift.tracing.trace(
        tokenRoot.methods.mint({
            amount: new BigNumber(mintAmount).shiftedBy(Constants.tokens.bar.decimals).toString(),
            recipient: owner.address,
            deployWalletValue: locklift.utils.toNano(0.1),
            remainingGasTo: owner.address,
            notify: false,
            payload: ''
        }).send({amount: locklift.utils.toNano(2), from: rootOwner.address})
    )
    return address.value0;
}

function expectAmountFee(numerator: number, denominator: number, amount: number): number {
    const fee: number = (numerator/denominator) * amount;
    return fee

}
