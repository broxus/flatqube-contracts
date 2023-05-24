import chalk from 'chalk';
import { expect } from 'chai';
import BigNumber from 'bignumber.js';
import { Account } from 'everscale-standalone-client/nodejs';

import {
    Address,
    Contract,
    getRandomNonce,
    toNano,
    WalletTypes,
    zeroAddress,
} from 'locklift';
import { FactorySource } from '../../build/factorySource';
//@ts-ignore
import {
    accountMigration,
    logMigrationSuccess,
    tokenRootMigration,
} from '../../v2/utils';

import {
    dexAccountMigration,
    dexPairMigration,
    dexRootMigration,
    orderFactoryMigration,
    orderRootMigration,
    tokenFactoryMigration,
    multiScatterMigration
} from '../utils/migration.new.utils';

import { TokenWallet } from '../utils/wrappers/tokenWallet';

import { OrderFactory } from '../utils/wrappers/order_factory';
import { OrderRoot } from '../utils/wrappers/order_root';
import { OrderWrapper } from '../utils/wrappers/order';
import {MSWrapper, PayloadOrder} from "../utils/wrappers/ms";

describe('MultiScatter', () => {
    const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';
    const barDecimals = 9;
    const tstDecimals = 9;

    let factoryOrder: OrderFactory;
    let RootOrderBar: OrderRoot;
    let RootOrderTst: OrderRoot;

    let multiScatter: MSWrapper;

    let rootTokenBar: Contract<FactorySource['TokenRootUpgradeable']>;
    let rootTokenReceive: Contract<FactorySource['TokenRootUpgradeable']>;

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

    before('Deploy and load new migration', async () => {
        account1 = await accountMigration('10000', 'Account1', '1');
        account2 = await accountMigration('10000', 'Account2', '2');
        account3 = await accountMigration('10000', 'Account3', '3');
        account4 = await accountMigration('10000', 'Account4', '4');
        account5 = await accountMigration('10000', 'Account5', '5');
        account6 = await accountMigration('10000', 'Account6', '6');
        account7 = await accountMigration('10000', 'Account7', '7');
        account8 = await accountMigration('10000', 'Account8', '8');

        tokenFactory = await tokenFactoryMigration(account1);

        const [dexRoot, dexVault] = await dexRootMigration(account1, tokenFactory);

        dexAccount = await dexAccountMigration(account1, dexRoot);

        rootTokenBar = await tokenRootMigration(
            'BarRoot',
            'BAR',
            barDecimals,
            account1,
        );
        rootTokenReceive = await tokenRootMigration(
            'TstRoot',
            'TST',
            tstDecimals,
            account1,
        );

        const wallet1Address = await deployWallet(
            account1,
            rootTokenReceive,
            account1,
            3000,
        );
        const wallet1 = await TokenWallet.from_addr(
            wallet1Address,
            account1,
            'wallet1',
        );

        const wallet2Address = await deployWallet(
            account1,
            rootTokenBar,
            account1,
            3000,
        );
        const wallet2 = await TokenWallet.from_addr(
            wallet2Address,
            account1,
            'wallet2',
        );
        const addressFactory = await orderFactoryMigration(
            account1,
            1,
            dexRoot,
            0,
            0,
            0,
            0,
        );

        factoryOrder = await OrderFactory.from_addr(
            addressFactory.address,
            account1,
        );

        const factoryAddress = (
            await rootTokenReceive.methods
                .walletOf({ walletOwner: factoryOrder.address, answerId: 0 })
                .call()
        ).value0;

        FactoryWalletTst = await TokenWallet.from_addr(
            factoryAddress,
            factoryOrder.address,
            'FactoryWalletTst',
        );

        const addressMS = await multiScatterMigration(
            1, true,
            account1,
        );

        multiScatter = await MSWrapper.from_addr(
            addressMS.address,
            account1
        );

        await locklift.tracing.trace(
            wallet1.transfer(
                numberString(2500, barDecimals),
                dexAccount.address,
                EMPTY_TVM_CELL,
                toNano(3),
            ),
        );

        await wallet2.transfer(
            numberString(2500, barDecimals),
            dexAccount.address,
            EMPTY_TVM_CELL,
            toNano(3),
        );

        const TestFactory = await locklift.factory.getDeployedContract(
            'OrderFactory',
            factoryOrder.address,
        );
        const addressRootBar = await orderRootMigration(
            account1,
            TestFactory,
            rootTokenBar,
        );
        const addressRootTST = await orderRootMigration(
            account1,
            TestFactory,
            rootTokenReceive,
        );

        RootOrderBar = await OrderRoot.from_addr(addressRootBar.address, account1);
        RootOrderTst = await OrderRoot.from_addr(addressRootTST.address, account1);

        await locklift.tracing.trace(
            rootTokenBar.methods
                .deployWallet({
                    answerId: 1,
                    walletOwner: account1.address,
                    deployWalletValue: toNano(7),
                })
                .send({ amount: toNano(9), from: account1.address }),
        );

        await locklift.tracing.trace(
            rootTokenReceive.methods
                .deployWallet({
                    answerId: 1,
                    walletOwner: account1.address,
                    deployWalletValue: toNano(7),
                })
                .send({ amount: toNano(9), from: account1.address }),
        );

        const barWallet2Address = await deployWallet(
            account2,
            rootTokenBar,
            account1,
        );
        barWallet2 = await TokenWallet.from_addr(
            barWallet2Address,
            account2,
            'barWallet2',
        );

        const tstWallet2Address = await deployWallet(
            account2,
            rootTokenReceive,
            account1,
        );
        tstWallet2 = await TokenWallet.from_addr(
            tstWallet2Address,
            account2,
            'tstWallet2',
        );

        const barWallet3Address = await deployWallet(
            account3,
            rootTokenBar,
            account1,
        );
        barWallet3 = await TokenWallet.from_addr(
            barWallet3Address,
            account3,
            'barWallet3',
        );

        const tstWallet3Address = await deployWallet(
            account3,
            rootTokenReceive,
            account1,
        );
        tstWallet3 = await TokenWallet.from_addr(
            tstWallet3Address,
            account3,
            'tstWallet3',
        );

        const barWallet4Address = await deployWallet(
            account4,
            rootTokenBar,
            account1,
        );
        barWallet4 = await TokenWallet.from_addr(
            barWallet4Address,
            account4,
            'barWallet4',
        );

        const tstWallet4Address = await deployWallet(
            account4,
            rootTokenReceive,
            account1,
        );
        tstWallet4 = await TokenWallet.from_addr(
            tstWallet4Address,
            account4,
            'tstWallet4',
        );

        const barWallet5Address = await deployWallet(
            account5,
            rootTokenBar,
            account1,
        );
        barWallet5 = await TokenWallet.from_addr(
            barWallet5Address,
            account5,
            'barWallet5',
        );

        const tstWallet5Address = await deployWallet(
            account5,
            rootTokenReceive,
            account1,
        );
        tstWallet5 = await TokenWallet.from_addr(
            tstWallet5Address,
            account5,
            'tstWallet5',
        );

        const barWallet6Address = await deployWallet(
            account6,
            rootTokenBar,
            account1,
        );
        barWallet6 = await TokenWallet.from_addr(
            barWallet6Address,
            account6,
            'barWallet6',
        );

        const tstWallet6Address = await deployWallet(
            account6,
            rootTokenReceive,
            account1,
        );
        tstWallet6 = await TokenWallet.from_addr(
            tstWallet6Address,
            account6,
            'tstWallet6',
        );

        console.log(`OrderFactory: ${factoryOrder.address}`);
        console.log(`OrderRootBar: ${RootOrderBar.address}`);
        console.log(`OrderRootTst: ${RootOrderTst.address}`);
        console.log(`MultiScatter: ${multiScatter.address}`);
        console.log(`BarRoot: ${rootTokenBar.address}`);
        console.log(`TSTRoot: ${rootTokenReceive.address}`);
        console.log(`Account1: ${account1.address}`);
        console.log('');
        console.log(`Account2: ${account2.address}`);
        console.log(`BarWallet2: ${barWallet2.address}`);
        console.log(`TstWallet2: ${tstWallet2.address}`);
        console.log('');
        console.log(`Account3: ${account3.address}`);
        console.log(`BarWallet3: ${barWallet3.address}`);
        console.log(`TstWallet3: ${tstWallet3.address}`);
        console.log('');
        console.log(`Account4: ${account4.address}`);
        console.log(`BarWallet4: ${barWallet4.address}`);
        console.log(`TstWallet4: ${tstWallet4.address}`);
        console.log('');
        console.log(`Account5: ${account5.address}`);
        console.log(`BarWallet5: ${barWallet5.address}`);
        console.log(`TstWallet5: ${tstWallet5.address}`);
        console.log('');
        console.log(`Account6: ${account6.address}`);
        console.log(`BarWallet6: ${barWallet6.address}`);
        console.log(`TstWallet6: ${tstWallet6.address}`);
        console.log('');

        const feesBar = await RootOrderBar.feeParams();
        console.log(`Beneficary = ${feesBar.params.beneficiary}\nFee - ${feesBar.params.numerator}/${feesBar.params.denominator}/
        ${feesBar.params.matchingNumerator}/${feesBar.params.matchingDenominator}`);

        const feesTst = await RootOrderTst.feeParams();
        console.log(`Beneficary = ${feesTst.params.beneficiary}\nFee - ${feesTst.params.numerator}/${feesTst.params.denominator}/
        ${feesTst.params.matchingNumerator}/${feesTst.params.matchingDenominator}`);
    });

    describe('Test MS', async () => {
        it('Create 2 order: full filled and part filled', async () => {
            console.log(`#############################\n`);
            let amount = await barWallet3.balance();
            const balanceBarAcc3Start = await accountTokenBalances(
                barWallet3,
                barDecimals,
            );
            const balanceTstAcc3Start = await accountTokenBalances(
                tstWallet3,
                tstDecimals,
            );
            await displayLog(
                balanceBarAcc3Start,
                balanceTstAcc3Start,
                true,
                'Account3',
            );

            const balanceBarAcc4Start = await accountTokenBalances(
                barWallet4,
                barDecimals,
            );
            const balanceTstAcc4Start = await accountTokenBalances(
                tstWallet4,
                tstDecimals,
            );
            await displayLog(
                balanceBarAcc4Start,
                balanceTstAcc4Start,
                true,
                'Account4',
            );

            const balanceBarAcc5Start = await accountTokenBalances(
                barWallet5,
                barDecimals,
            );
            const balanceTstAcc5Start = await accountTokenBalances(
                tstWallet5,
                tstDecimals,
            );
            await displayLog(
                balanceBarAcc5Start,
                balanceTstAcc5Start,
                true,
                'Account4',
            );

            const payloadOrders: PayloadOrder[] = [];

            //LO1
            let TOKEN_FOR_SPENT1 = 10;
            let TOKEN_FOR_RECEIVE1 = 20;
            let FULL_TOKEN_RECEIVE1 = TOKEN_FOR_RECEIVE1;

            const payload1 = await RootOrderBar.buildPayloadRoot(
                1,
                zeroAddress,
                rootTokenReceive.address,
                numberString(TOKEN_FOR_RECEIVE1, tstDecimals),
                0,
                0,
            );

            await locklift.tracing.trace(
                barWallet3.transfer(
                    numberString(TOKEN_FOR_SPENT1, barDecimals),
                    RootOrderBar.address,
                    payload1,
                    toNano(6),
                ),
                {allowedCodes: {compute: [60, null]}},
            );

            const order1 = await RootOrderBar.getEventCreateOrder(account3);
            console.log(`Order 1 ${order1.address}`);

            const cancelPayload1 = await order1.originalPayloadCancel(22, 111, account4.address);
            const payloadLO1 = await order1.buildPayload(1, 0.1, account4.address, '', cancelPayload1);
            let pO1: PayloadOrder
            pO1 = {
                amount: numberString(FULL_TOKEN_RECEIVE1, tstDecimals),
                gasValue: toNano(2.2),
                destination: order1.address,
                payload: payloadLO1
            }
            payloadOrders.push(pO1)
            //

            //LO2
            let TOKEN_FOR_SPENT2 = 30;
            let TOKEN_FOR_RECEIVE2 = 10;
            let FULL_TOKEN_SPENT2 = 15;
            let FULL_TOKEN_RECEIVE2 = 5;

            const payload2 = await RootOrderBar.buildPayloadRoot(
                2,
                zeroAddress,
                rootTokenReceive.address,
                numberString(TOKEN_FOR_RECEIVE2, tstDecimals),
                0,
                0,
            );

            await locklift.tracing.trace(
                barWallet3.transfer(
                    numberString(TOKEN_FOR_SPENT2, barDecimals),
                    RootOrderBar.address,
                    payload2,
                    toNano(6),
                ),
                {allowedCodes: {compute: [60, null]}},
            );

            const order2 = await RootOrderBar.getEventCreateOrder(account3);
            console.log(`Order 2 ${order2.address}`);

            const cancelPayload2 = await order2.originalPayloadCancel(22, 222, account4.address);
            const payloadLO2 = await order2.buildPayload(2, 0.1, account4.address, '', cancelPayload2);
            let pO2: PayloadOrder
            pO2 = {
                amount: numberString(FULL_TOKEN_RECEIVE2, tstDecimals),
                gasValue: toNano(2.2),
                destination: order2.address,
                payload: payloadLO2
            }
            payloadOrders.push(pO2);

            const payloadForMS = await multiScatter.buildPayload(payloadOrders)
            await locklift.tracing.trace(tstWallet4.transfer(
                    numberString(FULL_TOKEN_RECEIVE1 + FULL_TOKEN_RECEIVE2, tstDecimals),
                    multiScatter.address, payloadForMS, toNano(6),
                ),
                {allowedCodes: {compute: [60, null]}},
            );

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            await displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, barDecimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, tstDecimals);
            await displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(new BigNumber(TOKEN_FOR_SPENT1 + TOKEN_FOR_SPENT2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(new BigNumber(FULL_TOKEN_RECEIVE1 + FULL_TOKEN_RECEIVE2)).toString();

            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(new BigNumber(TOKEN_FOR_SPENT1 + FULL_TOKEN_SPENT2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(new BigNumber(FULL_TOKEN_RECEIVE1 + FULL_TOKEN_RECEIVE2)).toString();

            expect(3).to.be.equal((Number(await order1.status())), 'Wrong status Limit Order 1');
            expect(2).to.be.equal((Number(await order2.status())), 'Wrong status Limit Order 2');
            expect(0).to.equal(Number(await (locklift.provider.getBalance(order1.address))), "Wrong Order 1 Ever balance")
            expect(Number(await (locklift.provider.getBalance(order2.address)))).to.above(0, "Wrong Order 2 Ever balance");
            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Account4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Account4 Tst balance');
        });
        it('Upgrade MultiScatter', async () => {
            const newCode = (await locklift.factory.getContractArtifacts("TestNewMultiScatter")).code
            const newVersion = 2;
            await multiScatter.upgrade(newCode, newVersion, account1.address)

            const newMS = await locklift.factory.getDeployedContract("TestNewMultiScatter", multiScatter.address)
            const currentVersion = (await newMS.methods.getDetails({answerId: 1}).call()).value2;
            const testMessage = (await newMS.methods.newFunc().call()).value0;

            expect(testMessage).to.equal("Test update", "Wrong Upgrade MS")
            expect(newVersion.toString()).to.equal(currentVersion.toString(), "Wrong MS new version")
        });
        it('TokensTransfer', async () => {
            let amount = await barWallet3.balance();
            const balanceBarAcc3Start = await accountTokenBalances(
                barWallet3,
                barDecimals,
            );
            const balanceTstAcc3Start = await accountTokenBalances(
                tstWallet3,
                tstDecimals,
            );
            await displayLog(
                balanceBarAcc3Start,
                balanceTstAcc3Start,
                true,
                'Account3',
            );

            const TOKENS_FOR_SEND = 10;
            const signer1 = await locklift.keystore.getSigner("1");
            const tokenWalletBarToken = await rootTokenBar.methods.walletOf({
                walletOwner: multiScatter.address,
                answerId: 1
            }).call()
            await locklift.tracing.trace(
                barWallet3.transfer(
                    numberString(TOKENS_FOR_SEND, barDecimals),
                    multiScatter.address,
                    '',
                    toNano(3)
                ), {allowedCodes: {compute: [60, null]}})

            await multiScatter.proxyTokensTransfer(
                tokenWalletBarToken.value0,
                0.4,
                numberString(TOKENS_FOR_SEND, barDecimals),
                account3.address,
                0,
                account1.address,
                true,
                EMPTY_TVM_CELL,
                true
            );

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, barDecimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, tstDecimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString());

        });
        it('SendGas', async() => {
            const EverAccountStart = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9).toString();
            const EverMultiScatterStart = new BigNumber(await locklift.provider.getBalance(multiScatter.address)).shiftedBy(-9).toString();

            await multiScatter.sendGas(account3.address, toNano(1), 66);

            const EverAccountEnd = new BigNumber(await locklift.provider.getBalance(account3.address)).shiftedBy(-9).toString();
            const EverMultiScatterEnd = new BigNumber(await locklift.provider.getBalance(multiScatter.address)).shiftedBy(-9).toString();

            expect(Number(EverAccountEnd)).to.above(Number(EverAccountStart), 'Wrong account3 ever balance');
            expect(Number(EverMultiScatterStart)).to.above(Number(EverMultiScatterEnd), 'Wrong multiscatter ever balance');
        });
    });
});

async function accountTokenBalances(
    contract: any,
    decimals: any,
): Promise<{ token: BigNumber }> {
    let token: BigNumber;
    await contract
        .balance()
        .then((n) => {
            token = new BigNumber(n).shiftedBy(-decimals);
        })
        .catch((e) => {
            /*ignored*/
        });

    return { token };
}

async function displayLog(
    balanceBar: any,
    balanceTst: any,
    start: any,
    accountText: any,
) {
    console.log(
        ` ${chalk.bold.blue(`${accountText} balance`)} ${
            start == true ? ' start: ' : ' end: '
        }` +
        `${chalk.green(
            `${balanceBar !== undefined ? balanceBar.token + ' BAR' : 'BAR'},`,
        )}` +
        `${chalk.green(
            `${balanceTst !== undefined ? balanceTst.token + ' TST' : 'TST'}`,
        )}`,
    );
}

async function deployWallet(
    owner: Account,
    tokenRoot: Contract<FactorySource['TokenRootUpgradeable']>,
    rootOwner: Account,
    mintAmount: number = 500,
): Promise<Address> {
    await locklift.tracing.trace(
        tokenRoot.methods
            .deployWallet({
                answerId: 1,
                walletOwner: owner.address,
                deployWalletValue: toNano(7),
            })
            .send({ amount: toNano(9), from: owner.address }),
    );

    const address = await tokenRoot.methods
        .walletOf({ answerId: 1, walletOwner: owner.address })
        .call();

    await locklift.tracing.trace(
        tokenRoot.methods
            .mint({
                amount: new BigNumber(mintAmount).shiftedBy(9).toString(),
                recipient: owner.address,
                deployWalletValue: toNano(0.1),
                remainingGasTo: owner.address,
                notify: false,
                payload: '',
            })
            .send({ amount: toNano(2), from: rootOwner.address }),
    );
    return address.value0;
}

function expectAmountFee(
    numerator: number,
    denominator: number,
    amount: number,
): number {
    const fee: number = (numerator / denominator) * amount;
    return fee;
}

function numberString(amount: number, decimals: number): string {
    return new BigNumber(amount).shiftedBy(decimals).toString();
}