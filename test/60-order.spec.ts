import {Address, Contract, getRandomNonce} from 'locklift';
import {FactorySource} from '../build/factorySource';
import {Constants, sleep} from '../scripts/utils';
import {
    accountMigration,
    tokenRootMigration,
    logMigrationSuccess,
} from '../utils';
import {expect} from 'chai';
import {Account} from 'everscale-standalone-client/nodejs';
import {
    dexAccountMigration,
    dexPairMigration,
    dexRootMigration, dexVaultMigration,
    orderFactoryMigration,
    orderRootMigration, tokenFactoryMigration
} from "../utils/migration.new.utils";
import BigNumber from "bignumber.js";
import lockliftConfig from "../locklift.config";

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

    let factoryOrder: Contract<FactorySource['OrderFactory']>;
    let RootOrderBar: Contract<FactorySource['OrderRoot']>;
    let Order: Contract<FactorySource['Order']>;

    let rootTokenBar: Contract<FactorySource['TokenRootUpgradeable']>;
    let rootTokenReceive: Contract<FactorySource['TokenRootUpgradeable']>;
    let FooBarLpRoot: Contract<FactorySource['TokenRootUpgradeable']>;

    let dexPair: Contract<FactorySource['DexPair']>;

    let account1: Account;
    let account2: Account;
    let barWallet2: Contract<FactorySource['TokenWalletUpgradeable']>;
    let tstWallet2: Contract<FactorySource['TokenWalletUpgradeable']>;

    let account3: Account;
    let barWallet3: Contract<FactorySource['TokenWalletUpgradeable']>;
    let tstWallet3: Contract<FactorySource['TokenWalletUpgradeable']>;

    let account4: Account;
    let barWallet4: Contract<FactorySource['TokenWalletUpgradeable']>;
    let tstWallet4: Contract<FactorySource['TokenWalletUpgradeable']>;

    let account5: Account;
    let barWallet5: Contract<FactorySource['TokenWalletUpgradeable']>;
    let tstWallet5: Contract<FactorySource['TokenWalletUpgradeable']>;

    let account6: Account;
    let barWallet6: Contract<FactorySource['TokenWalletUpgradeable']>;
    let tstWallet6: Contract<FactorySource['TokenWalletUpgradeable']>;

    let tokenFactory: Contract<FactorySource['TokenFactory']>;
    let dexVault: Contract<FactorySource['DexVault']>;
    let dexAccount: Contract<FactorySource['DexAccount']>;

    let FooPairWallet: Contract<FactorySource['TokenWalletUpgradeable']>;
    let BarPairWallet: Contract<FactorySource['TokenWalletUpgradeable']>;

    before('deploy and load new migrations', async () => {
        account1 = await accountMigration('10000', "Account1", "1");
        account2 = await accountMigration('10000', "Account2", "2");
        account3 = await accountMigration('10000', "Account3", "3");
        account4 = await accountMigration('10000', "Account4", "4");
        account5 = await accountMigration('10000', "Account5", "5");
        account6 = await accountMigration('10000', "Account6", "6");

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
        const wallet2Address = await deployWallet(account1, rootTokenBar, account1, 3000)
        const wallet1 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            wallet1Address,
        );
        const wallet2 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            wallet2Address,
        );


        factoryOrder = await orderFactoryMigration(account1, 1, dexRoot);
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


        const BarPairWalletAddress = (await rootTokenBar.methods.walletOf({walletOwner: dexPair.address, answerId: 0}).call()).value0
        BarPairWallet = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            BarPairWalletAddress,
        );
        const FooPairWalletAddress = (await rootTokenReceive.methods.walletOf({walletOwner: dexPair.address, answerId: 0}).call()).value0
        FooPairWallet = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            FooPairWalletAddress,
        );
        logMigrationSuccess(
            'DexPair',
            'getTokenRoots',
            `LP root for BAR/TST : ${FooBarLpRoot.address}\nBarPairWallet - ${BarPairWallet.address}\nFooPairWallet - ${FooPairWallet.address}`,
        );
        await locklift.tracing.trace(
            dexAccount.methods.addPair({
                left_root: lproot.left,
                right_root: lproot.right
            }).send({
                    amount: locklift.utils.toNano(10), from: account1.address
                }), {allowedCodes: {compute: [100]}}
        )
        await
            locklift.tracing.trace(wallet1.methods.transfer({
                    amount: new BigNumber(2000).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: dexAccount.address,
                    deployWalletValue: locklift.utils.toNano(0.1),
                    remainingGasTo: account1.address,
                    notify: true,
                    payload: EMPTY_TVM_CELL
                }).send({
                    amount: locklift.utils.toNano(10), from: account1.address
                })
            )
        await
            wallet2.methods.transfer({
                amount: new BigNumber(2000).shiftedBy(Constants.tokens.bar.decimals).toString(),
                recipient: dexAccount.address,
                deployWalletValue: locklift.utils.toNano(0.1),
                remainingGasTo: account1.address,
                notify: true,
                payload: EMPTY_TVM_CELL
            }).send({
                amount: locklift.utils.toNano(10), from: account1.address
            })
        RootOrderBar = await orderRootMigration(account1, factoryOrder, rootTokenBar)


        await locklift.tracing.trace(rootTokenBar.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: locklift.utils.toNano(7),
            })
            .send({amount: locklift.utils.toNano(10), from: account1.address}));

        await locklift.tracing.trace(rootTokenReceive.methods
            .deployWallet({
                answerId: 1,
                walletOwner: dexPair.address,
                deployWalletValue: locklift.utils.toNano(7),
            })
            .send({amount: locklift.utils.toNano(10), from: account1.address}));
        await locklift.tracing.trace(
            dexAccount.methods.depositLiquidity({
                call_id: getRandomNonce(),
                left_root: rootTokenBar.address,
                left_amount: new BigNumber(200).shiftedBy(Constants.tokens.bar.decimals).toString(),
                right_root: rootTokenReceive.address,
                right_amount: new BigNumber(2000).shiftedBy(Constants.tokens.bar.decimals).toString(),
                expected_lp_root: lproot.lp,
                auto_change: true,
                send_gas_to: account1.address
            }).send({amount: locklift.utils.toNano(10), from: account1.address})
        )
        const barWallet2Address = await deployWallet(account2, rootTokenBar, account1)
        barWallet2 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            barWallet2Address,
        );

        const tstWallet2Address = await deployWallet(account2, rootTokenReceive, account1)
        tstWallet2 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            tstWallet2Address,
        );

        const barWallet3Address = await deployWallet(account3, rootTokenBar, account1)
        barWallet3 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            barWallet3Address,
        );

        const tstWallet3Address = await deployWallet(account3, rootTokenReceive, account1)
        tstWallet3 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            tstWallet3Address,
        );

        const barWallet4Address = await deployWallet(account4, rootTokenBar, account1)
        barWallet4 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            barWallet4Address,
        );

        const tstWallet4Address = await deployWallet(account4, rootTokenReceive, account1)
        tstWallet4 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            tstWallet4Address,
        );

        const barWallet5Address = await deployWallet(account5, rootTokenBar, account1)
        barWallet5 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            barWallet5Address,
        );

        const tstWallet5Address = await deployWallet(account5, rootTokenReceive, account1)
        tstWallet5 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            tstWallet5Address,
        );

        const barWallet6Address = await deployWallet(account6, rootTokenBar, account1)
        barWallet6 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            barWallet6Address,
        );

        const tstWallet6Address = await deployWallet(account6, rootTokenReceive, account1)
        tstWallet6 = locklift.factory.getDeployedContract(
            'TokenWalletUpgradeable',
            tstWallet6Address,
        );

        console.log(`OrderFactory: ${factoryOrder.address}`);
        console.log(`OrderRoot: ${RootOrderBar.address}`);
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

    });

    // describe('Direct execution Order', async () => {
    //     it('Check full execution, case 1.1', async () => {
    //         console.log(`#############################\n`);
    //         let amount = await barWallet3.methods
    //             .balance({answerId: 0})
    //             .call();
    //         console.log(`BALANCE _ ${amount.value0}`)
    //         const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //
    //         const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");
    //
    //         const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //         const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account4");
    //
    //         TOKENS_TO_EXCHANGE1 = 10;
    //         TOKENS_TO_EXCHANGE2 = 20;
    //
    //         TOKENS_TO_EXCHANGE1_ACC3 = 5;
    //         TOKENS_TO_EXCHANGE1_ACC4 = 5;
    //
    //         TOKENS_TO_EXCHANGE2_ACC3 = 10;
    //         TOKENS_TO_EXCHANGE2_ACC4 = 10;
    //         const params = {
    //             tokenReceive: rootTokenReceive.address,
    //             expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             backPK: 0,
    //             callbackId: 0
    //         }
    //         console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //         const payload = await RootOrderBar.methods.buildPayload(params).call();
    //         console.log(`Result payload = ${payload.value0}`);
    //
    //         console.log(`BarWallet3(${barWallet3.address}).transfer()
    //             amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //             recipient: ${RootOrderBar.address},
    //             deployWalletValue: ${locklift.utils.toNano(0.1)},
    //             remainingGasTo: ${account3.address},
    //             notify: ${true},
    //             payload: ${JSON.stringify(params)}
    //         )`);
    //
    //         await barWallet3.methods.transfer({
    //                 amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //                 recipient: RootOrderBar.address,
    //                 deployWalletValue: locklift.utils.toNano(0.1),
    //                 remainingGasTo: account3.address,
    //                 notify: true,
    //                 payload: payload.value0
    //         }).send({
    //                 amount: locklift.utils.toNano(10), from: account3.address
    //         })
    //
    //         const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //         const orderAddress = pastEvents.events[0].data.order
    //         console.log(`Order - ${orderAddress}`)
    //         Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //         const payloadLO = await Order.methods.buildPayload({
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             callbackId: "1"
    //         }).call();
    //
    //         await tstWallet4.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             recipient: Order.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account4.address,
    //             notify: true,
    //             payload: payloadLO.value0
    //         }).send({
    //             amount: locklift.utils.toNano(10), from: account4.address
    //         })
    //
    //
    //         await tstWallet5.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             recipient: Order.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account5.address,
    //             notify: true,
    //             payload: payloadLO.value0
    //         }).send({
    //             amount: locklift.utils.toNano(10), from: account5.address
    //         })
    //
    //         const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //
    //         const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");
    //
    //         const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //         const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //         await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");
    //
    //         const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
    //         const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
    //         const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
    //         const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
    //         const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
    //         const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
    //
    //         expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //         expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
    //         expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
    //         expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
    //         expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
    //         expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
    //     });
    //     // it('Check partial execution Order, case 2.2', async () => {
    //     //     console.log(`#############################`);
    //     //     console.log(``);
    //     //     const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //     //
    //     //     const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");
    //     //
    //     //     const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");
    //     //
    //     //     const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");
    //     //
    //     //     TOKENS_TO_EXCHANGE1 = 20;
    //     //     TOKENS_TO_EXCHANGE1_ACC3 = 10;
    //     //     TOKENS_TO_EXCHANGE1_ACC4 = 5;
    //     //     TOKENS_TO_EXCHANGE1_ACC5 = 5;
    //     //
    //     //     TOKENS_TO_EXCHANGE2 = 40;
    //     //     TOKENS_TO_EXCHANGE2_ACC3 = 20;
    //     //     TOKENS_TO_EXCHANGE2_ACC4 = 10;
    //     //     TOKENS_TO_EXCHANGE2_ACC5 = 10;
    //     //
    //     //     const params = {
    //     //         tokenReceive: rootTokenReceive.address,
    //     //         expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         backPK: 0,
    //     //         callbackId: 0
    //     //     }
    //     //     console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //     //     const payload = await RootOrderBar.methods.buildPayload(params).call();
    //     //
    //     //     console.log(`Result payload = ${payload.value0}`);
    //     //     console.log(`BarWallet3(${barWallet3.address}).transfer()
    //     //                 amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //     //                 recipient: ${RootOrderBar.address},
    //     //                 deployWalletValue: ${locklift.utils.toNano(0.1)},
    //     //                 remainingGasTo: ${account3.address},
    //     //                 notify: ${true},
    //     //                 payload: ${JSON.stringify(params)}
    //     //             )`);
    //     //     await barWallet3.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //     //         recipient: RootOrderBar.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account3.address,
    //     //         notify: true,
    //     //         payload: payload.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(6), from: account3.address
    //     //     })
    //     //     const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //     //     const orderAddress = pastEvents.events[0].data.order
    //     //     console.log(`Order - ${orderAddress}`)
    //     //     Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //     //     const payloadLO = await Order.methods.buildPayload({
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         callbackId: "1"
    //     //     }).call();
    //     //
    //     //     await tstWallet4.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account4.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account4.address
    //     //     })
    //     //
    //     //     await tstWallet5.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account5.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account5.address
    //     //     })
    //     //
    //     //     await tstWallet6.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account6.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account6.address
    //     //     })
    //     //     const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //     //
    //     //     const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");
    //     //
    //     //     const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");
    //     //
    //     //     const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");
    //     //
    //     //     const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
    //     //     const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
    //     //     const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
    //     //     const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
    //     //     const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC5)).toString();
    //     //     const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC5)).toString();
    //     //
    //     //     expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
    //     //     expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
    //     //     expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
    //     //     expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
    //     //     expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Account6 Bar balance');
    //     //     expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Account6 Tst balance');
    //     // });
    //     // it('Check partial execution Order, case 2.3', async () => {
    //     //     console.log(`#############################`);
    //     //     console.log(``);
    //     //     const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //     //
    //     //     const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");
    //     //
    //     //     const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");
    //     //
    //     //     const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");
    //     //
    //     //     TOKENS_TO_EXCHANGE1 = 20;
    //     //     TOKENS_TO_EXCHANGE1_ACC3 = 10;
    //     //     TOKENS_TO_EXCHANGE1_ACC4 = 5;
    //     //     TOKENS_TO_EXCHANGE1_ACC5 = 10;
    //     //
    //     //     TOKENS_TO_EXCHANGE2 = 40;
    //     //     TOKENS_TO_EXCHANGE2_ACC3 = 20;
    //     //     TOKENS_TO_EXCHANGE2_ACC4 = 10;
    //     //     TOKENS_TO_EXCHANGE2_ACC5 = 20;
    //     //
    //     //     const params = {
    //     //         tokenReceive: rootTokenReceive.address,
    //     //         expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         backPK: 0,
    //     //         callbackId: 0
    //     //     }
    //     //     console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //     //     const payload = await RootOrderBar.methods.buildPayload(params).call();
    //     //
    //     //     console.log(`Result payload = ${payload.value0}`);
    //     //     console.log(`BarWallet3(${barWallet3.address}).transfer()
    //     //     amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //     //     recipient: ${RootOrderBar.address},
    //     //     deployWalletValue: ${locklift.utils.toNano(0.1)},
    //     //     remainingGasTo: ${account3.address},
    //     //     notify: ${true},
    //     //     payload: ${JSON.stringify(params)}
    //     //     )`);
    //     //     await barWallet3.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //     //         recipient: RootOrderBar.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account3.address,
    //     //         notify: true,
    //     //         payload: payload.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(6), from: account3.address
    //     //     })
    //     //     const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //     //     const orderAddress = pastEvents.events[0].data.order
    //     //     console.log(`Order - ${orderAddress}`)
    //     //     Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //     //     const payloadLO = await Order.methods.buildPayload({
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         callbackId: "1"
    //     //     }).call();
    //     //
    //     //     await tstWallet4.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account4.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account4.address
    //     //     })
    //     //
    //     //     await tstWallet5.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account5.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account5.address
    //     //     })
    //     //
    //     //     await tstWallet6.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         recipient: Order.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account6.address,
    //     //         notify: true,
    //     //         payload: payloadLO.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(10), from: account6.address
    //     //     })
    //     //     const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //     //
    //     //     const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");
    //     //
    //     //     const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");
    //     //
    //     //     const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");
    //     //
    //     //     const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
    //     //     const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
    //     //     const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
    //     //     const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
    //     //     const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
    //     //     const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
    //     //     const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC5 - 5)).toString();
    //     //     const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC5 - 10)).toString();
    //     //
    //     //     expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //     //     expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
    //     //     expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
    //     //     expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
    //     //     expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Account5 Bar balance');
    //     //     expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Account5 Tst balance');
    //     //     expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Account6 Bar balance');
    //     //     expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Account6 Tst balance');
    //     // });
    //     // it('Check create order and closed, case 3.1', async () => {
    //     //     console.log(`#############################`);
    //     //     console.log(``);
    //     //     const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //     //
    //     //     TOKENS_TO_EXCHANGE1 = 10;
    //     //     TOKENS_TO_EXCHANGE2 = 20;
    //     //
    //     //     const params = {
    //     //         tokenReceive: rootTokenReceive.address,
    //     //         expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         backPK: 0,
    //     //         callbackId: 0
    //     //     }
    //     //     console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //     //     const payload = await RootOrderBar.methods.buildPayload(params).call();
    //     //
    //     //     console.log(`Result payload = ${payload.value0}`);
    //     //     console.log(`BarWallet3(${barWallet3.address}).transfer()
    //     //     amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //     //     recipient: ${RootOrderBar.address},
    //     //     deployWalletValue: ${locklift.utils.toNano(0.1)},
    //     //     remainingGasTo: ${account3.address},
    //     //     notify: ${true},
    //     //     payload: ${JSON.stringify(params)}
    //     //     )`);
    //     //     await barWallet3.methods.transfer({
    //     //         amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //     //         recipient: RootOrderBar.address,
    //     //         deployWalletValue: locklift.utils.toNano(0.1),
    //     //         remainingGasTo: account3.address,
    //     //         notify: true,
    //     //         payload: payload.value0
    //     //     }).send({
    //     //         amount: locklift.utils.toNano(6), from: account3.address
    //     //     })
    //     //     const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //     //     const orderAddress = pastEvents.events[0].data.order
    //     //     console.log(`Order - ${orderAddress}`)
    //     //     Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //     //     await Order.methods.cancel({}).send({
    //     //         amount: locklift.utils.toNano(10), from: account3.address
    //     //     })
    //     //
    //     //     const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()
    //     //
    //     //     const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //     //     const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //     //     await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //     //
    //     //     expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //     //     expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
    //     //     expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
    //     //     const orderBalance = await locklift.provider.getBalance(Order.address);
    //     //     expect(orderBalance.toString()).to.equal("0", "Wrong Order Ever balance")
    //     // });
    //     it('Check create order and closed, case 3.2', async () => {
    //         console.log(`#############################`);
    //         console.log(``);
    //         const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //
    //         const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');
    //
    //         TOKENS_TO_EXCHANGE1 = 10;
    //         TOKENS_TO_EXCHANGE2 = 20;
    //         TOKENS_TO_EXCHANGE2_ACC3 = 10;
    //
    //         const params = {
    //             tokenReceive: rootTokenReceive.address,
    //             expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             backPK: 0,
    //             callbackId: 0
    //         }
    //         console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //         const payload = await RootOrderBar.methods.buildPayload(params).call();
    //
    //         console.log(`Result payload = ${payload.value0}`);
    //         console.log(`BarWallet3(${barWallet3.address}).transfer()
    //         amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //         recipient: ${RootOrderBar.address},
    //         deployWalletValue: ${locklift.utils.toNano(0.1)},
    //         remainingGasTo: ${account3.address},
    //         notify: ${true},
    //         payload: ${JSON.stringify(params)}
    //         )`);
    //         await barWallet3.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //             recipient: RootOrderBar.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account3.address,
    //             notify: true,
    //             payload: payload.value0
    //         }).send({
    //             amount: locklift.utils.toNano(6), from: account3.address
    //         })
    //         const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //         const orderAddress = pastEvents.events[0].data.order
    //         console.log(`Order - ${orderAddress}`)
    //         Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //
    //         const payloadLO = await Order.methods.buildPayload({
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             callbackId: "1"
    //         }).call();
    //
    //         await tstWallet4.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             recipient: Order.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account4.address,
    //             notify: true,
    //             payload: payloadLO.value0
    //         }).send({
    //             amount: locklift.utils.toNano(10), from: account4.address
    //         })
    //
    //         await Order.methods.cancel({}).send({
    //             amount: locklift.utils.toNano(10), from: account3.address
    //         })
    //
    //         const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()
    //         const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //
    //         const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');
    //
    //         const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
    //         const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
    //         const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
    //         const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
    //
    //         expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //         expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
    //         expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
    //         expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
    //
    //         expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
    //         const orderBalance = await locklift.provider.getBalance(Order.address);
    //         expect(orderBalance.toString()).to.equal("0", "Wrong Order Ever balance")
    //     });
    //     it('Check execution closed order, case 4.1', async () => {
    //         console.log(`#############################`);
    //         console.log(``);
    //         const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //
    //         const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');
    //
    //         TOKENS_TO_EXCHANGE1 = 15;
    //         TOKENS_TO_EXCHANGE2 = 30;
    //
    //         const params = {
    //             tokenReceive: rootTokenReceive.address,
    //             expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             backPK: 0,
    //             callbackId: 0
    //         }
    //         console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //         const payload = await RootOrderBar.methods.buildPayload(params).call();
    //
    //         console.log(`Result payload = ${payload.value0}`);
    //         console.log(`BarWallet3(${barWallet3.address}).transfer()
    //         amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //         recipient: ${RootOrderBar.address},
    //         deployWalletValue: ${locklift.utils.toNano(0.1)},
    //         remainingGasTo: ${account3.address},
    //         notify: ${true},
    //         payload: ${JSON.stringify(params)}
    //         )`);
    //         await barWallet3.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //             recipient: RootOrderBar.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account3.address,
    //             notify: true,
    //             payload: payload.value0
    //         }).send({
    //             amount: locklift.utils.toNano(6), from: account3.address
    //         })
    //         const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //         const orderAddress = pastEvents.events[0].data.order
    //         console.log(`Order - ${orderAddress}`)
    //         pastEvents.events.forEach(event => {
    //             console.log(`address - ${event.data.order}\ncreated_at - ${event.data.createdAt}`)
    //         })
    //         Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //
    //         const payloadLO = await Order.methods.buildPayload({
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             callbackId: "1"
    //         }).call();
    //
    //         await Order.methods.cancel({}).send({
    //             amount: locklift.utils.toNano(10), from: account3.address
    //         })
    //
    //         await tstWallet4.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             recipient: Order.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account4.address,
    //             notify: true,
    //             payload: payloadLO.value0
    //         }).send({
    //             amount: locklift.utils.toNano(10), from: account4.address
    //         })
    //         const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()
    //
    //         const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //
    //         const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
    //         const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
    //         await displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');
    //
    //         expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //         expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
    //         expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
    //         expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
    //         expect(stateL0.value0.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
    //     });
    // });

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
          const params = {
              tokenReceive: rootTokenReceive.address,
              expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
              deployWalletValue: locklift.utils.toNano(0.1),
              backPK: `0x${signer.publicKey}`,
              callbackId: 0
          }
          console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
          const payload = await RootOrderBar.methods.buildPayload(params).call();

          console.log(`Result payload = ${payload.value0}`);
          console.log(`BarWallet3(${barWallet3.address}).transfer()
              amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
              recipient: ${RootOrderBar.address},
              deployWalletValue: ${locklift.utils.toNano(0.1)},
              remainingGasTo: ${account3.address},
              notify: ${true},
              payload: ${JSON.stringify(params)}
              )`);
        await barWallet3.methods.transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
          recipient: RootOrderBar.address,
          deployWalletValue: locklift.utils.toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0}).send({
          amount: locklift.utils.toNano(6), from: account3.address
           })
        const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
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
        const signer3 = await locklift.keystore.getSigner("3");
        await Order.methods.backendSwap({callbackId: 1}).sendExternal({publicKey: signer3.publicKey})


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
          const params = {
              tokenReceive: rootTokenReceive.address,
              expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
              deployWalletValue: locklift.utils.toNano(0.1),
              backPK: `0x${signer.publicKey}`,
              callbackId: 0
          }
          console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
          const payload = await RootOrderBar.methods.buildPayload(params).call();

          console.log(`Result payload = ${payload.value0}`);
          console.log(`BarWallet3(${barWallet3.address}).transfer()
              amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
              recipient: ${RootOrderBar.address},
              deployWalletValue: ${locklift.utils.toNano(0.1)},
              remainingGasTo: ${account3.address},
              notify: ${true},
              payload: ${JSON.stringify(params)}
              )`);
        await barWallet3.methods.transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
          recipient: RootOrderBar.address,
          deployWalletValue: locklift.utils.toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0}).send({
          amount: locklift.utils.toNano(6), from: account3.address
           })
        const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
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
            amount: locklift.utils.toNano(10), from: account3.address
        })

        const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
        const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
        await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

        expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        const stateL0 = await Order.methods.currentStatus({answerId: 1}).call()
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

          const params = {
              tokenReceive: rootTokenReceive.address,
              expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
              deployWalletValue: locklift.utils.toNano(0.2),
              backPK: 0,
              callbackId: 0
          }
          console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
          const payload = await RootOrderBar.methods.buildPayload(params).call();

          console.log(`Result payload = ${payload.value0}`);
          console.log(`BarWallet3(${barWallet3.address}).transfer()
              amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
              recipient: ${RootOrderBar.address},
              deployWalletValue: ${locklift.utils.toNano(0.2)},
              remainingGasTo: ${account3.address},
              notify: ${true},
              payload: ${JSON.stringify(params)}
              )`);
        await barWallet3.methods.transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
          recipient: RootOrderBar.address,
          deployWalletValue: locklift.utils.toNano(0.2),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0}).send({
          amount: locklift.utils.toNano(6), from: account3.address
           })
        const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
        const orderAddress = pastEvents.events[0].data.order
        console.log(`Order - ${orderAddress}`)
        Order = await locklift.factory.getDeployedContract("Order", orderAddress)
        const state = await Order.methods.currentStatus({answerId: 1}).call()
          console.log(state.value0)
        const expected = await dexPair.methods.expectedExchange({
            answerId: 1,
            amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
            spent_token_root: rootTokenBar.address
        }).call()

        console.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
        console.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
        console.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

        // await locklift.tracing.trace(Order.methods.swap({
        //     deployWalletValue: locklift.utils.toNano(1),
        //     callbackId: 1
        // }).send({
        //     amount: locklift.utils.toNano(20), from: account3.address
        // }), {allowedCodes: {compute: [60]}})
        await locklift.tracing.trace(Order.methods.swap({
            deployWalletValue: locklift.utils.toNano(1),
            callbackId: 1
        }).send({
            amount: locklift.utils.toNano(20), from: account4.address
        }), {allowedCodes: {compute: [60]}}
        )

        await sleep(10000)
        const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()

        const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
        const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
        await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

        const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
        const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
        await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

        const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
        const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
        const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals)).minus(new BigNumber(TOKENS_TO_EXCHANGE2))).toString();

        expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');

        expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
        expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        expect(stateLO2.value0.toString()).to.equal(new BigNumber(3).toString(), 'Wrong status Limit order');
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
          const params = {
              tokenReceive: rootTokenReceive.address,
              expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
              deployWalletValue: locklift.utils.toNano(0.2),
              backPK: 0,
              callbackId: 0
          }
          console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
          const payload = await RootOrderBar.methods.buildPayload(params).call();

          console.log(`Result payload = ${payload.value0}`);
          console.log(`BarWallet3(${barWallet3.address}).transfer()
              amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
              recipient: ${RootOrderBar.address},
              deployWalletValue: ${locklift.utils.toNano(0.1)},
              remainingGasTo: ${account3.address},
              notify: ${true},
              payload: ${JSON.stringify(params)}
              )`);
        await barWallet3.methods.transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
          recipient: RootOrderBar.address,
          deployWalletValue: locklift.utils.toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0}).send({
          amount: locklift.utils.toNano(6), from: account3.address
           })
        const pastEvents = await RootOrderBar.getPastEvents({ filter: event => event.event === "CreateOrder" });
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

        await Order.methods.swap({
            deployWalletValue: locklift.utils.toNano(0.1),
            callbackId: 1
        }).send({
            amount: locklift.utils.toNano(5), from: account3.address
        })
        await sleep(10000)
        const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()

        const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
        const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
        await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

        const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
        const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
        await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

        const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();

        expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
        expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
        expect(stateLO2.value0.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
      });
    });

    // describe('Emergency mode', async () => {
    //     it('Emergency mode on, send TIP3, off', async () => {
    //         console.log(`#############################`);
    //         console.log(``);
    //         const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");
    //
    //         TOKENS_TO_EXCHANGE1 = 10;
    //         TOKENS_TO_EXCHANGE2 = 20;
    //
    //         const params = {
    //             tokenReceive: rootTokenReceive.address,
    //             expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
    //             deployWalletValue: locklift.utils.toNano(0.2),
    //             backPK: 0,
    //             callbackId: 0
    //         }
    //         console.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
    //         const payload = await RootOrderBar.methods.buildPayload(params).call();
    //
    //         console.log(`Result payload = ${payload.value0}`);
    //         console.log(`BarWallet3(${barWallet3.address}).transfer()
    //         amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
    //         recipient: ${RootOrderBar.address},
    //         deployWalletValue: ${locklift.utils.toNano(0.1)},
    //         remainingGasTo: ${account3.address},
    //         notify: ${true},
    //         payload: ${JSON.stringify(params)}
    //         )`);
    //         await barWallet3.methods.transfer({
    //             amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //             recipient: RootOrderBar.address,
    //             deployWalletValue: locklift.utils.toNano(0.1),
    //             remainingGasTo: account3.address,
    //             notify: true,
    //             payload: payload.value0
    //         }).send({
    //             amount: locklift.utils.toNano(6),
    //             from: account3.address,
    //         });
    //
    //         const pastEvents = await RootOrderBar.getPastEvents({filter: event => event.event === "CreateOrder"});
    //         const orderAddress = pastEvents.events[0].data.order
    //         console.log(`Order - ${orderAddress}`)
    //         Order = await locklift.factory.getDeployedContract("Order", orderAddress)
    //         const signer1 = await locklift.keystore.getSigner("1");
    //         await factoryOrder.methods.setEmergency({
    //             enabled: true,
    //             orderAddress: Order.address,
    //             manager: `0x${signer1.publicKey}`
    //         }).send({
    //             amount: locklift.utils.toNano(3),
    //             from: account1.address
    //         });
    //
    //         const stateLO1 = await Order.methods.currentStatus({answerId: 1}).call()
    //         expect(stateLO1.value0.toString()).to.equal(new BigNumber(6).toString(), 'Wrong status Limit order');
    //
    //         const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
    //             walletOwner: Order.address,
    //             answerId: 1
    //         }).call()
    //         await Order.methods.proxyTokensTransfer({
    //                 _tokenWallet: tokenWalletBarToken.value0,
    //                 _gasValue: locklift.utils.toNano(0.4),
    //                 _amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
    //                 _recipient: account3.address,
    //                 _deployWalletValue: 0,
    //                 _remainingGasTo: account1.address,
    //                 _notify: true,
    //                 _payload: EMPTY_TVM_CELL
    //         }).sendExternal({publicKey: signer1.publicKey});
    //
    //         await factoryOrder.methods.setEmergency({
    //             enabled: false,
    //             orderAddress: Order.address,
    //             manager: `0x${signer1.publicKey}`
    //         }).send({
    //             amount: locklift.utils.toNano(6), from: account1.address
    //         })
    //
    //         const stateLO2 = await Order.methods.currentStatus({answerId: 1}).call()
    //         expect(stateLO2.value0.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
    //
    //         const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
    //         const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
    //         displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");
    //
    //         expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
    //     });
    // });
});

async function accountTokenBalances(contract, decimals) {
    let token;
    await contract.methods
        .balance({answerId: 0})
        .call().then(n => {
            token = new BigNumber(n.value0).shiftedBy(- decimals);
        }).catch(e => {/*ignored*/
        });

    return {token}
}

async function displayLog(balanceBar, balanceTst, start, accountText) {
    console.log(`${accountText} balance ${start == true ? ' start: ' : ' end: '}` +
        `${balanceBar !== undefined ? balanceBar.token + ' BAR' : 'BAR'},` +
        `${balanceTst !== undefined ? balanceTst.token + ' TST' : 'TST'}`);
}

async function deployWallet(owner: Account, tokenRoot: Contract<FactorySource['TokenRootUpgradeable']>, rootOwner: Account, mintAmount: number = 120): Address {
    await locklift.tracing.trace(tokenRoot.methods
        .deployWallet({
            answerId: 1,
            walletOwner: owner.address,
            deployWalletValue: locklift.utils.toNano(7),
        })
        .send({amount: locklift.utils.toNano(10), from: owner.address}));

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
        }).send({amount: locklift.utils.toNano(10), from: rootOwner.address})
    )
    return address.value0;
}
