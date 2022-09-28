const { Migration, Constants, TOKEN_CONTRACTS_PATH, EMPTY_TVM_CELL, sleep } = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
const { expect } = require('chai');
BigNumber.config({ EXPONENTIAL_AT: 257 });
const logger = require('mocha-logger');

const migration = new Migration();

let keyPairs;

let factoryOrder;
let RootOrderBar;
let Order;

let rootTokenBar;
let rootTokenRecieve;
let dexPair;

let account1;
let account2;
let barWallet2;
let tstWallet2;

let account3;
let barWallet3
let tstWallet3;

let account4;
let barWallet4;
let tstWallet4;

let account5;
let barWallet5;
let tstWallet5;

let account6;
let barWallet6;
let tstWallet6;

describe('Check orders', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);

    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();
        dexPair = migration.load(await locklift.factory.getContract('DexPair'), 'DexPairBarTst');

        factoryOrder = migration.load(await locklift.factory.getContract('OrderFactory'), 'OrderFactory');
        RootOrderBar = await locklift.factory.getContract('OrderRoot');
        Order = await locklift.factory.getContract('Order');

        rootTokenBar = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'BarRoot');
        rootTokenRecieve = migration.load(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH), 'TstRoot');

        barWallet2 = migration.load(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH), 'BarWallet2');
        tstWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        barWallet3 = migration.load(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH), 'BarWallet3');
        tstWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        barWallet4 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        tstWallet4 = migration.load(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH), 'TstWallet4');

        barWallet5 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        tstWallet5 = migration.load(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH), 'TstWallet5');

        barWallet6 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        tstWallet6 = migration.load(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH), 'TstWallet6');

        const rootOrder = await factoryOrder.call({
            method: 'getExpectedAddressOrderRoot',
            params: { token: rootTokenBar.address }
        });

        RootOrderBar.setAddress(rootOrder);
        migration.store(RootOrderBar, 'OrderRoot');

        account1 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        account2 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account2');
        account3 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account3');
        account4 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account4');
        account5 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account5');
        account6 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account6');

        const tokenWalletAddressTstWallet2 = await rootTokenRecieve.call({
            method: 'walletOf', params: {
                walletOwner: account2.address
            }
        });

        tstWallet2.setAddress(tokenWalletAddressTstWallet2);
        migration.store(tstWallet2, 'TstWallet2');

        const tokenWalletAddressTstWallet3 = await rootTokenRecieve.call({
            method: 'walletOf', params: {
                walletOwner: account3.address
            }
        });

        tstWallet3.setAddress(tokenWalletAddressTstWallet3);
        migration.store(tstWallet3, 'TstWallet3');

        const tokenWalletAddressBarWallet4 = await rootTokenBar.call({
            method: 'walletOf', params: {
                walletOwner: account4.address
            }
        });

        barWallet4.setAddress(tokenWalletAddressBarWallet4);
        migration.store(barWallet4, 'BarWallet4');

        const tokenWalletAddressBarWallet5 = await rootTokenBar.call({
            method: 'walletOf', params: {
                walletOwner: account5.address
            }
        });

        barWallet5.setAddress(tokenWalletAddressBarWallet5);
        migration.store(barWallet5, 'BarWallet5');

        const tokenWalletAddressBarWallet6 = await rootTokenBar.call({
            method: 'walletOf', params: {
                walletOwner: account6.address
            }
        });

        barWallet6.setAddress(tokenWalletAddressBarWallet6);
        migration.store(barWallet6, 'BarWallet6');

        logger.log(`OrderFactory: ${factoryOrder.address}`);
        logger.log(`OrderRoot: ${RootOrderBar.address}`);
        logger.log(`Account1: ${account1.address}`);
        logger.log('')
        logger.log(`Account2: ${account2.address}`);
        logger.log(`BarWallet2: ${barWallet2.address}`);
        logger.log(`TstWallet2: ${tstWallet2.address}`);
        logger.log('')
        logger.log(`Account3: ${account3.address}`);
        logger.log(`BarWallet3: ${barWallet3.address}`);
        logger.log(`TstWallet3: ${tstWallet3.address}`);
        logger.log('')
        logger.log(`Account4: ${account4.address}`);
        logger.log(`BarWallet4: ${barWallet4.address}`);
        logger.log(`TstWallet4: ${tstWallet4.address}`);
        logger.log('')
        logger.log(`Account5: ${account5.address}`);
        logger.log(`BarWallet5: ${barWallet5.address}`);
        logger.log(`TstWallet5: ${tstWallet5.address}`);
        logger.log('')
        logger.log(`Account6: ${account6.address}`);
        logger.log(`BarWallet6: ${barWallet6.address}`);
        logger.log(`TstWallet6: ${tstWallet6.address}`);
        logger.log('')
    });

    describe('Direct execution Order', async function () {
        it('Check full execution, case 1.1', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                recipient: ${RootOrderBar.address},
                deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                remainingGasTo: ${account3.address},
                notify: ${true},
                payload: ${JSON.stringify(params)}
            )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            const tx2 = await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });

            logger.log(`Hit to Order txId: ${tx2.transaction.id}`);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
        });

        it('Check partial esxecution Order, case 2.1', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE1_ACC3 = 5;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;

            TOKENS_TO_EXCHANGE2 = 20;
            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;

            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                    amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                    recipient: ${RootOrderBar.address},
                    deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                    remainingGasTo: ${account3.address},
                    notify: ${true},
                    payload: ${JSON.stringify(params)}
                )`);

            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });

            await account5.runTarget({
                contract: tstWallet5,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account5.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[4]
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Accoun5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Accoun5 Tst balance');
        });

        it('Check partial execution Order, case 2.2', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 5;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 10;

            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                        amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                        recipient: ${RootOrderBar.address},
                        deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                        remainingGasTo: ${account3.address},
                        notify: ${true},
                        payload: ${JSON.stringify(params)}
                    )`);

            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });

            await account5.runTarget({
                contract: tstWallet5,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account5.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[4]
            });

            await account6.runTarget({
                contract: tstWallet6,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account6.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[5]
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc5End, balanceTstAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc6End, balanceTstAcc6End, false, "Account6");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC5)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Accoun5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Accoun5 Tst balance');
            expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Accoun6 Bar balance');
            expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Accoun6 Tst balance');
        });

        it('Check partial execution Order, case 2.3', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            const balanceBarAcc5Start = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5Start = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc5Start, balanceTstAcc5Start, true, "Account5");

            const balanceBarAcc6Start = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6Start = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc6Start, balanceTstAcc6Start, true, "Account6");

            TOKENS_TO_EXCHANGE1 = 20;
            TOKENS_TO_EXCHANGE1_ACC3 = 10;
            TOKENS_TO_EXCHANGE1_ACC4 = 5;
            TOKENS_TO_EXCHANGE1_ACC5 = 10;

            TOKENS_TO_EXCHANGE2 = 40;
            TOKENS_TO_EXCHANGE2_ACC3 = 20;
            TOKENS_TO_EXCHANGE2_ACC4 = 10;
            TOKENS_TO_EXCHANGE2_ACC5 = 20;

            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                                amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                                recipient: ${RootOrderBar.address},
                                deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                                remainingGasTo: ${account3.address},
                                notify: ${true},
                                payload: ${JSON.stringify(params)}
                            )`);

            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });


            await account5.runTarget({
                contract: tstWallet5,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC4).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account5.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[4]
            });


            await account6.runTarget({
                contract: tstWallet6,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC5).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account6.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[5]
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceBarAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceBarAcc4End, false, "Account4");

            const balanceBarAcc5End = await accountTokenBalances(barWallet5, Constants.tokens.bar.decimals);
            const balanceTstAcc5End = await accountTokenBalances(tstWallet5, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc5End, balanceBarAcc5End, false, "Account5");

            const balanceBarAcc6End = await accountTokenBalances(barWallet6, Constants.tokens.bar.decimals);
            const balanceTstAcc6End = await accountTokenBalances(tstWallet6, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc6End, balanceBarAcc6End, false, "Account6");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC3)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount5Bar = new BigNumber(balanceBarAcc5Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC4)).toString();
            const expectedAccount5Tst = new BigNumber(balanceTstAcc5Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC4)).toString();
            const expectedAccount6Bar = new BigNumber(balanceBarAcc6Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1_ACC5 - 5)).toString();
            const expectedAccount6Tst = new BigNumber(balanceTstAcc6Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC5 - 10)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(expectedAccount5Bar).to.equal(balanceBarAcc5End.token.toString(), 'Wrong Accoun5 Bar balance');
            expect(expectedAccount5Tst).to.equal(balanceTstAcc5End.token.toString(), 'Wrong Accoun5 Tst balance');
            expect(expectedAccount6Bar).to.equal(balanceBarAcc6End.token.toString(), 'Wrong Accoun6 Bar balance');
            expect(expectedAccount6Tst).to.equal(balanceTstAcc6End.token.toString(), 'Wrong Accoun6 Tst balance');
        });

        it('Check create order and closed, case 3.1', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, 'Account3');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
            amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
            recipient: ${RootOrderBar.address},
            deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
            remainingGasTo: ${account3.address},
            notify: ${true},
            payload: ${JSON.stringify(params)}
        )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const tx1 = await account3.runTarget({
                contract: Order,
                method: 'cancel',
                params: {},
                keyPair: keyPairs[2]
            });

            logger.log(`txId: ${tx1.transaction.id}`);

            const stateLO = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, 'Account3');

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(stateLO.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
            expect(await locklift.utils.convertCrystal((await locklift.ton.getBalance(Order.address)), 'ton').toNumber()).to.equal(0, 'Wrong Order Ever balance');
        });

        it('Check partial execution order and closed, case 3.2', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, 'Account3');

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            TOKENS_TO_EXCHANGE2_ACC3 = 10;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
            amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
            recipient: ${RootOrderBar.address},
            deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
            remainingGasTo: ${account3.address},
            notify: ${true},
            payload: ${JSON.stringify(params)}
        )`);

            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2_ACC3).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });

            await account3.runTarget({
                contract: Order,
                method: 'cancel',
                params: {},
                keyPair: keyPairs[2]
            });

            const stateLO = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, false, 'Account3');

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, false, 'Account4');

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();
            const expectedAccount4Bar = new BigNumber(balanceBarAcc4Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE1 / 2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE2_ACC3)).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(expectedAccount4Bar).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(stateLO.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');
            expect(await locklift.utils.convertCrystal((await locklift.ton.getBalance(Order.address)), 'ton').toNumber()).to.equal(0, 'Wrong Order Ever balance');
        });

        it('Check execution closed order, case 4.1', async function () {
            logger.log(`#############################`);
            logger.log(``);
            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, 'Account3');

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, 'Account4');

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
            amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
            recipient: ${RootOrderBar.address},
            deployWalletValue: ${locklift.utils.convertCrystal(0.2, 'nano')},
            remainingGasTo: ${account3.address},
            notify: ${true},
            payload: ${JSON.stringify(params)}
        )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const payloadLO = await Order.call({
                method: 'buildPayload',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                }
            });

            await account3.runTarget({
                contract: Order,
                method: 'cancel',
                params: {},
                keyPair: keyPairs[2]
            });

            await account4.runTarget({
                contract: tstWallet4,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                    recipient: Order.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account4.address,
                    notify: true,
                    payload: payloadLO
                },
                value: locklift.utils.convertCrystal(3, 'nano'),
                keyPair: keyPairs[3]
            });

            sleep(30);

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, 'Account3');

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, 'Account4');

            const stateLO = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(balanceTstAcc4Start.token.toString()).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(stateLO.toString()).to.equal(new BigNumber(5).toString(), 'Wrong status Limit order');

            sleep(1000);
        });
    });

    describe('Execution order via DEX ', async function () {
        it('Order from backend SUCCESS', async function () {
            logger.log(`#############################`);
            logger.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: new BigNumber(keyPairs[3].public, 16).toString(10)
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                                amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                                recipient: ${RootOrderBar.address},
                                deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                                remainingGasTo: ${account3.address},
                                notify: ${true},
                                payload: ${JSON.stringify(params)}
                            )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const expected = await dexPair.call({
                method: 'expectedExchange',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: rootTokenBar.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            const txForSwap = await Order.run({
                method: 'backendSwap',
                params: {},
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[3]
            });

            console.log('Tx: ', txForSwap.id);

            sleep(3000);
            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals))).toString();
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
        });

        it('Order from backend CANCEL', async function () {
            sleep(1000);
            logger.log(`#############################`);
            logger.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 60;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: new BigNumber(keyPairs[3].public, 16).toString(10)
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                                        amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                                        recipient: ${RootOrderBar.address},
                                        deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                                        remainingGasTo: ${account3.address},
                                        notify: ${true},
                                        payload: ${JSON.stringify(params)}
                                    )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const expected = await dexPair.call({
                method: 'expectedExchange',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: rootTokenBar.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            const txForSwap = await Order.run({
                method: 'backendSwap',
                params: {},
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[3]
            });

            console.log('Tx: ', txForSwap.id);

            sleep(3000);
            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            const stateLO = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            expect(stateLO.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
        });

        it('Order from user SUCCESS', async function () {
            logger.log(`#############################`);
            logger.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;

            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                            amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                            recipient: ${RootOrderBar.address},
                            deployWalletValue: ${locklift.utils.convertCrystal(0.2, 'nano')},
                            remainingGasTo: ${account3.address},
                            notify: ${true},
                            payload: ${JSON.stringify(params)}
                        )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            const expected = await dexPair.call({
                method: 'expectedExchange',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: rootTokenBar.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE1} BAR`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals).toString()} TST`);

            const txForSwap = await account4.runTarget({
                contract: Order,
                method: 'swap',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[3]
            });
            console.log('Tx: ', txForSwap.id);

            const stateLO2 = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            sleep(1000);
            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount3Tst = new BigNumber(balanceTstAcc3Start.token || 0).plus(BigNumber(TOKENS_TO_EXCHANGE2)).toString();
            const expectedAccount4Tst = new BigNumber(balanceTstAcc4Start.token || 0).plus((new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.tst.decimals)).minus(new BigNumber(TOKENS_TO_EXCHANGE2))).toString();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(expectedAccount3Tst).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Accoun3 Tst balance');
            expect(balanceBarAcc4Start.token.toString()).to.equal(balanceBarAcc4End.token.toString(), 'Wrong Accoun4 Bar balance');
            expect(expectedAccount4Tst).to.equal(balanceTstAcc4End.token.toString(), 'Wrong Accoun4 Tst balance');
            expect(stateLO2.toString()).to.equal(new BigNumber(3).toString(), 'Wrong status Limit order');
        });

        it('Order from user CANCEL', async function () {
            sleep(1000);
            logger.log(`#############################`);
            logger.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            const balanceBarAcc4Start = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4Start = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4Start, balanceTstAcc4Start, true, "Account4");
            const ever = await locklift.utils.convertCrystal((await locklift.ton.getBalance(account4.address)), 'ton').toNumber();
            logger.log(`Account4 Ever balance start: ${ever !== undefined ? ever + ' EVER' : 'EVER'}`);

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 60;

            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                                amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                                recipient: ${RootOrderBar.address},
                                deployWalletValue: ${locklift.utils.convertCrystal(0.2, 'nano')},
                                remainingGasTo: ${account3.address},
                                notify: ${true},
                                payload: ${JSON.stringify(params)}
                            )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Limit order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Limit order: ${Order.address}`);
                }
            });

            const txForSwap = await account4.runTarget({
                contract: Order,
                method: 'swap',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano')
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[3]
            });
            console.log('Tx: ', txForSwap.id);

            const stateLO2 = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            sleep(1000);
            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            const balanceBarAcc4End = await accountTokenBalances(barWallet4, Constants.tokens.bar.decimals);
            const balanceTstAcc4End = await accountTokenBalances(tstWallet4, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc4End, balanceTstAcc4End, false, "Account4");
            const everEnd = await locklift.utils.convertCrystal((await locklift.ton.getBalance(account4.address)), 'ton').toNumber();
            logger.log(`Account4 Ever balance start: ${everEnd !== undefined ? everEnd + ' EVER' : 'EVER'}`);

            const expectedAccount3Bar = new BigNumber(balanceBarAcc3Start.token || 0).minus(BigNumber(TOKENS_TO_EXCHANGE1)).toString();
            const expectedAccount4Ever = new BigNumber(ever).minus(6.1).toNumber();

            expect(expectedAccount3Bar).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Account3 Bar balance');
            expect(balanceTstAcc3Start.token.toString()).to.equal(balanceTstAcc3End.token.toString(), 'Wrong Account3 Tst balance');
            expect(expectedAccount4Ever).to.lt(new BigNumber(everEnd).toNumber(), 'Wrong Accoun4 Ever balance');
            expect(stateLO2.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
        });
    });

    describe('Emergency mode', async function () {
        it('Emergency mode on, send TIP3, off ', async function () {
            logger.log(`#############################`);
            logger.log(``);

            const balanceBarAcc3Start = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3Start = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3Start, balanceTstAcc3Start, true, "Account3");

            TOKENS_TO_EXCHANGE1 = 10;
            TOKENS_TO_EXCHANGE2 = 20;
            const params = {
                tokenReceive: rootTokenRecieve.address,
                expectedTokenAmount: new BigNumber(TOKENS_TO_EXCHANGE2).shiftedBy(Constants.tokens.tst.decimals).toString(),
                deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                backPK: 0
            }

            logger.log(`OrderRoot.buildPayload(${JSON.stringify(params)})`);
            const payload = await RootOrderBar.call({
                method: 'buildPayload',
                params: params
            });
            logger.log(`Result payload = ${payload}`);

            logger.log(`BarWallet3(${barWallet3.address}).transfer()
                        amount: ${new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString()},
                        recipient: ${RootOrderBar.address},
                        deployWalletValue: ${locklift.utils.convertCrystal(0.1, 'nano')},
                        remainingGasTo: ${account3.address},
                        notify: ${true},
                        payload: ${JSON.stringify(params)}
                    )`);
            const tx = await account3.runTarget({
                contract: barWallet3,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    recipient: RootOrderBar.address,
                    deployWalletValue: locklift.utils.convertCrystal(0.1, 'nano'),
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(6, 'nano'),
                keyPair: keyPairs[2]
            });
            logger.log(`Create Order txId: ${tx.transaction.id}`);

            const events = await waitEventsCreateOrder(1);
            events.forEach(event => {
                if (event.name == 'CreateOrder') {
                    Order.setAddress(event.value.order);
                    migration.store(Order, 'Order');
                    logger.log(`Order: ${Order.address}`);
                }
            });

            await account1.runTarget({
                contract: factoryOrder,
                method: 'setEmergency',
                params: {
                    enabled: true,
                    orderAddress: Order.address,
                    manager: new BigNumber(keyPairs[0].public, 16).toString(10)
                },
                value: locklift.utils.convertCrystal('0.4', 'nano'),
                keyPair: keyPairs[0]
            });

            const stateLO1 = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            expect(stateLO1.toString()).to.equal(new BigNumber(6).toString(), 'Wrong status Limit order');

            consttokenWalletBarToken = await rootTokenBar.call({
                method: 'walletOf', params: {
                    walletOwner: Order.address
                }
            });

            await Order.run({
                method: 'proxyTokensTransfer',
                params: {
                    _tokenWallet: consttokenWalletBarToken,
                    _gasValue: locklift.utils.convertCrystal('0.4', 'nano'),
                    _amount: new BigNumber(TOKENS_TO_EXCHANGE1).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    _recipient: account3.address,
                    _deployWalletValue: 0,
                    _remainingGasTo: account1.address,
                    _notify: true,
                    _payload: EMPTY_TVM_CELL
                },
                value: locklift.utils.convertCrystal('0.4', 'nano'),
                keyPair: keyPairs[0]
            });

            await account1.runTarget({
                contract: factoryOrder,
                method: 'setEmergency',
                params: {
                    enabled: false,
                    orderAddress: Order.address,
                    manager: new BigNumber(keyPairs[1].public, 16).toString(10)
                },
                value: locklift.utils.convertCrystal('0.4', 'nano'),
                keyPair: keyPairs[0]
            });

            const stateLO2 = await Order.call({
                method: 'currentStatus',
                params: {}
            });

            const balanceBarAcc3End = await accountTokenBalances(barWallet3, Constants.tokens.bar.decimals);
            const balanceTstAcc3End = await accountTokenBalances(tstWallet3, Constants.tokens.tst.decimals);
            displayLog(balanceBarAcc3End, balanceTstAcc3End, false, "Account3");

            expect(balanceBarAcc3Start.token.toString()).to.equal(balanceBarAcc3End.token.toString(), 'Wrong Accoun3 Bar balance');
            expect(stateLO2.toString()).to.equal(new BigNumber(2).toString(), 'Wrong status Limit order');
        });
    });
});

async function displayLog(balanceBar, balanceTst, start, accountText) {
    logger.log(`${accountText} balance ${start == true ? ' start: ' : ' end: '}` +
        `${balanceBar !== undefined ? balanceBar.token + ' BAR' : 'BAR'},` +
        `${balanceTst !== undefined ? balanceTst.token + ' TST' : 'TST'}`);
};

async function accountTokenBalances(contract, decimals) {
    let token;
    await contract.call({ method: 'balance', params: {} }).then(n => {
        token = new BigNumber(n).shiftedBy(-decimals);
    }).catch(e => {/*ignored*/ });

    return { token }
}

async function waitEventsCreateOrder(limit) {
    const {
        result
    } = await this.locklift.ton.client.net.query_collection({
        collection: 'messages',
        filter: {
            src: { eq: RootOrderBar.address },
            msg_type: { eq: 2 },
        },
        order: [{ path: 'created_at', direction: "DESC" }, { path: 'created_lt', direction: "DESC" }],
        limit,
        result: 'body id src dst created_at created_lt'
    });

    const decodedMessages = [];
    for (let message of result) {
        const decodedMessage = await this.locklift.ton.client.abi.decode_message_body({
            abi: {
                type: 'Contract',
                value: RootOrderBar.abi
            },
            body: message.body,
            is_internal: false
        });

        decodedMessages.push({
            ...decodedMessage,
            messageId: message.id,
            dst: message.dst,
            created_at: message.created_at,
            created_lt: message.created_lt
        });
    }

    return decodedMessages;
}