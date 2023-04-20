const {expect} = require('chai');
const {
    Migration, afterRun, Constants, TOKEN_CONTRACTS_PATH, displayTx, expectedDepositLiquidityOneCoin, calcValue
} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
const {Command} = require('commander');
const program = new Command();
BigNumber.config({EXPONENTIAL_AT: 257});
const logger = require('mocha-logger');

let tx;

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-r, --roots <roots>', 'DexPool tokens list')
    .option('-cn, --contract_name <contract_name>', 'DexPool contract name');

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots ? JSON.parse(options.roots) : ['foo', 'bar', 'qwe'];
options.contract_name = options.contract_name || 'DexStablePool';

const tokens = [];
let poolName = '';
for (let item of options.roots) {
    poolName += Constants.tokens[item].symbol;
}
const N_COINS = options.roots.length;

let DexRoot
let DexVault;
let DexPool;
let tokenVaultWallets;
let poolLpVaultWallet;
let poolTokenWallets;
let poolLpPoolWallet;
let tokenRoots;
let poolLpRoot;
let Account3;
let tokenWallets3;
let poolLpWallet3;
let gasValues;

const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';

let keyPairs;

async function dexBalances() {
    const token_balances = [];
    for (let i = 0; i < N_COINS; i++) {
        token_balances.push(
            await tokenVaultWallets[i].call({method: 'balance', params: {}}).then(n => {
                return new BigNumber(n).shiftedBy(-tokens[i].decimals).toString();
            })
        )
    }
    const lp = await poolLpVaultWallet.call({method: 'balance', params: {}}).then(n => {
        return new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    });
    return {token_balances, lp};
}

async function account3balances() {
    const token_balances = [];
    for (let i = 0; i < N_COINS; i++) {
        await tokenWallets3[i].call({method: 'balance', params: {}}).then(n => {
            token_balances.push(
                new BigNumber(n).shiftedBy(-tokens[i].decimals).toString()
            );
        }).catch(e => {
            token_balances.push(
               undefined
            );
        });
    }
    let lp;
    await poolLpWallet3.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account3.address)), 'ton').toNumber();
    return {token_balances, lp, ton};
}

async function dexPoolInfo() {
    const balances = await DexPool.call({method: 'getBalances', params: {}});
    const total_supply = await poolLpRoot.call({method: 'totalSupply', params: {}});
    const tokenBalances = [];
    for (let i = 0; i < N_COINS; i++) {
        tokenBalances.push(new BigNumber(balances.balances[i]).shiftedBy(-tokens[i].decimals).toString());
    }

    return {
        token_balances: tokenBalances,
        lp_supply: new BigNumber(balances.lp_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        lp_supply_actual: new BigNumber(total_supply).shiftedBy(-Constants.LP_DECIMALS).toString()
    };
}

function logBalances(header, dex, account, pool) {
    let logs = `DEX balance ${header}: `;
    for (let i = 0; i < N_COINS; i++) {
        logs += `${dex.token_balances[i]} ${tokens[i].symbol}, `;
    }
    logs += `${dex.lp} LP`;
    logger.log(logs);

    logs = `DexPool ${header}: `;
    for (let i = 0; i < N_COINS; i++) {
        logs += `${pool.token_balances[i]} ${tokens[i].symbol}, `;
    }
    logs += `LP SUPPLY (PLAN): ${pool.lp_supply || "0"} LP, ` +
            `LP SUPPLY (ACTUAL): ${pool.lp_supply_actual || "0"} LP`;
    logger.log(logs);

    logs = `Account#3 balance ${header}: `;
    for (let i = 0; i < N_COINS; i++) {
        logs += account.token_balances[i] !== undefined ? `${account.token_balances[i]} ${tokens[i].symbol}, ` : `${tokens[i].symbol} (not deployed)}, `;
    }
    logs += account.lp !== undefined ? `${account.lp} LP` : `LP (not deployed)}`;
    logger.log(logs);
}

describe(`Check direct DexPool${poolName} operations`, async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');

        DexRoot = await locklift.factory.getContract('DexRoot');
        DexVault = await locklift.factory.getContract('DexVault');
        DexPool = await locklift.factory.getContract(options.contract_name);
        tokenRoots = [];
        let tempTokenRoots = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
            tempTokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        tokenVaultWallets = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenVaultWallets.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        poolTokenWallets = [];
        for (let i = 0; i < N_COINS; i++) {
            poolTokenWallets.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpPoolWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        Account3 = await locklift.factory.getAccount('Wallet');
        Account3.afterRun = afterRun;
        tokenWallets3 = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenWallets3.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        migration.load(DexRoot, 'DexRoot');
        migration.load(DexVault, 'DexVault');
        migration.load(DexPool, 'DexPool' + poolName);

        let roots = (await DexPool.call({method: 'getTokenRoots', params: {}})).roots;
        let tokenData = {}; // address to symbol
        for (let i = 0; i < N_COINS; i++) {
            let symbol = Constants.tokens[options.roots[i]].symbol;
            migration.load(tempTokenRoots[i], symbol + 'Root');
            tokenData[tempTokenRoots[i].address] = options.roots[i];
        }

        let tokenSymbols = [];
        for (let root of roots) {
            tokenSymbols.push(tokenData[root]);
        }

        for (let i = 0; i < N_COINS; i++) {
            let token = Constants.tokens[tokenSymbols[i]];
            tokens.push(token);
            migration.load(tokenRoots[i], token.symbol + 'Root');
        }
        for (let i = 0; i < N_COINS; i++) {
            migration.load(tokenVaultWallets[i], tokens[i].symbol + 'VaultWallet');
        }
        migration.load(poolLpVaultWallet, poolName + 'LpVaultWallet');
        for (let i = 0; i < N_COINS; i++) {
            migration.load(poolTokenWallets[i], poolName + 'Pool_' + tokens[i].symbol + 'Wallet');
        }
        migration.load(poolLpPoolWallet, poolName + 'Pool_' + 'LpWallet');
        for (let i = 0; i < N_COINS; i++) {
            migration.load(tokenRoots[i], tokens[i].symbol + 'Root');
        }
        migration.load(poolLpRoot, poolName + 'LpRoot');
        migration.load(Account3, 'Account3');

        for (let i = 0; i < N_COINS; i++) {
            if (migration.exists(tokens[i].symbol + 'Wallet3')) {
                migration.load(tokenWallets3[i], tokens[i].symbol + 'Wallet3');
                logger.log(tokens[i].symbol + `Wallet#3: ${tokenWallets3[i].address}`);
            } else {
                const expected = await tokenRoots[i].call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account3.address
                    }
                });
                logger.log(tokens[i].symbol + `Wallet#3: ${expected} (not deployed)`);
            }
        }

        if (migration.exists(poolName + 'LpWallet3')) {
            migration.load(poolLpWallet3, poolName + 'LpWallet3');
            logger.log(poolName + `LpWallet3: ${poolLpWallet3.address}`);
        } else {
            const expected = await poolLpRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account3.address
                }
            });
            logger.log(poolName + `LpWallet#3: ${expected} (not deployed)`);
        }

        let logs = `Vault wallets:\n`;
        for (let i = 0; i < N_COINS; i++) {
            logs += `${tokens[i].symbol}: ${tokenVaultWallets[i].address}\n`
        }
        logs += `LP: ${poolLpVaultWallet.address}`;
        logger.log(logs);

        logs = `Pool wallets:\n`;
        for (let i = 0; i < N_COINS; i++) {
            logs += `${tokens[i].symbol}: ${poolTokenWallets[i].address}\n`
        }
        logs += `LP: ${poolLpPoolWallet.address}`;
        logger.log(logs);

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log('DexVault: ' + DexVault.address);
        logger.log(`DexPool${poolName}: ` + DexPool.address);
        for (let i = 0; i < N_COINS; i++) {
            logger.log(tokens[i].symbol + 'Root: ' + tokenRoots[i].address);
        }
        logger.log('Account#3: ' + Account3.address);

        await migration.balancesCheckpoint();
    });

    describe('Direct exchange (positive)', async function () {
        let i = 0;
        for (let j = 0; j < N_COINS; j++) {
            if (i === j) continue;

            it(`0010 # Account#3 exchange Coin_1 to Coin_2 (with deploy Coin_2_Wallet#3)`, async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol} (with deploy ${tokens[j].symbol}Wallet#3)`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const TOKENS_TO_EXCHANGE = 1000;

                const expected = await DexPool.call({
                    method: 'expectedExchange', params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                        spent_token_root: tokenRoots[i].address,
                        receive_token_root: tokenRoots[j].address
                    }
                });

                logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} ${tokens[i].symbol}`);
                logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals).toString()} ${tokens[j].symbol}`);

                const payload = await DexPool.call({
                    method: 'buildExchangePayload', params: {
                        id: 0,
                        deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                        expected_amount: expected.expected_amount,
                        outcoming: tokenRoots[j].address,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectExchangeGas',
                    params: {
                        deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: tokenWallets3[i],
                    method: 'transfer',
                    params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                tokenWallets3[j].setAddress(await tokenRoots[j].call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account3.address
                    }
                }));

                migration.store(tokenWallets3[j], tokens[j].symbol + 'Wallet3');

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexSpentToken = new BigNumber(dexStart.token_balances[i]).plus(TOKENS_TO_EXCHANGE).toString();
                const expectedDexReceivedToken = new BigNumber(dexStart.token_balances[j])
                    .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();
                const expectedAccountSpentToken = new BigNumber(accountStart.token_balances[i]).minus(TOKENS_TO_EXCHANGE).toString();
                const expectedAccountReceivedToken = new BigNumber(accountStart.token_balances[j] || 0)
                    .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();

                expect(expectedDexSpentToken).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedDexReceivedToken).to.equal(dexEnd.token_balances[j].toString(), `Wrong DEX ${tokens[j].symbol} balance`);
                expect(expectedAccountSpentToken).to.equal(accountEnd.token_balances[i].toString(), `Wrong DexAccount#3 ${tokens[i].symbol} balance`);
                expect(expectedAccountReceivedToken).to.equal(accountEnd.token_balances[j].toString(), `Wrong DexAccount#3 ${tokens[j].symbol} balance`);
            });
        }

        let j = 0;
        for (let i = 0; i < N_COINS; i++) {
            if (i === j) continue;

            it('0020 # Account#3 exchange Coin_1 to Coin_2', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol}`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const TOKENS_TO_EXCHANGE = 100;

                const expected = await DexPool.call({
                    method: 'expectedExchange', params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                        spent_token_root: tokenRoots[i].address,
                        receive_token_root: tokenRoots[j].address
                    }
                });

                logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE.toString()} ${tokens[i].symbol}`);
                logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals).toString()} ${tokens[j].symbol}`);

                const payload = await DexPool.call({
                    method: 'buildExchangePayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: expected.expected_amount,
                        outcoming: tokenRoots[j].address,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectExchangeGas',
                    params: {
                        deployWalletValue: 0,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: tokenWallets3[i],
                    method: 'transfer',
                    params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexReceivedToken = new BigNumber(dexStart.token_balances[j])
                    .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();
                const expectedDexSpentToken = new BigNumber(dexStart.token_balances[i]).plus(TOKENS_TO_EXCHANGE).toString();
                const expectedAccountReceivedToken = new BigNumber(accountStart.token_balances[j])
                    .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();
                const expectedAccountSpentToken = new BigNumber(accountStart.token_balances[i]).minus(TOKENS_TO_EXCHANGE).toString();

                expect(expectedDexSpentToken).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedDexReceivedToken).to.equal(dexEnd.token_balances[j].toString(), `Wrong DEX ${tokens[j].symbol} balance`);
                expect(expectedAccountSpentToken).to.equal(accountEnd.token_balances[i].toString(), `Wrong DexAccount#3 ${tokens[i].symbol} balance`);
                expect(expectedAccountReceivedToken).to.equal(accountEnd.token_balances[j].toString(), `Wrong DexAccount#3 ${tokens[j].symbol} balance`);
            });

            it('0030 # Account#3 exchange Coin1 to Coin2 (expectedSpendAmount)', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol}`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const TOKENS_TO_RECEIVE = 1;

                const expected = await DexPool.call({
                    method: 'expectedSpendAmount', params: {
                        receive_amount: new BigNumber(TOKENS_TO_RECEIVE).shiftedBy(tokens[j].decimals).toString(),
                        receive_token_root: tokenRoots[j].address,
                        spent_token_root: tokenRoots[i].address,
                    }
                });

                logger.log(`Expected spend amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected receive amount: ${TOKENS_TO_RECEIVE} ${tokens[j].symbol}`);

                const payload = await DexPool.call({
                    method: 'buildExchangePayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: 0,
                        outcoming: tokenRoots[j].address,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectExchangeGas',
                    params: {
                        deployWalletValue: 0,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: tokenWallets3[i],
                    method: 'transfer',
                    params: {
                        amount: expected.expected_amount,
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexReceivedAmount = new BigNumber(dexStart.token_balances[j])
                    .minus(TOKENS_TO_RECEIVE).toString();
                const expectedDexSpentAmount = new BigNumber(dexStart.token_balances[i])
                    .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[i].decimals)).toString();
                const expectedAccountReceivedAmount = new BigNumber(accountStart.token_balances[j])
                    .plus(TOKENS_TO_RECEIVE).toString();
                const expectedAccountSpentAmount = new BigNumber(accountStart.token_balances[i])
                    .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[i].decimals)).toString();

                expect(expectedDexReceivedAmount).to.equal(dexEnd.token_balances[j].toString(), `Wrong DEX ${tokens[j].symbol} balance`);
                expect(expectedDexSpentAmount).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedAccountReceivedAmount).to.equal(accountEnd.token_balances[j].toString(), `Wrong Account#3 ${tokens[j].symbol} balance`);
                expect(expectedAccountSpentAmount).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            });
        }

        it('0040 # Account#3 exchange Coin_1 to Coin_2 (small amount)', async function () {
            let i = 0;
            let j = 1;

            logger.log('#################################################');
            logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol} (small amount)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const AMOUNT = 100 * Math.pow(10, Math.max(tokens[i].decimals - tokens[j].decimals, 0));

            const expected = await DexPool.call({
                method: 'expectedExchange', params: {
                    amount: AMOUNT,
                    spent_token_root: tokenRoots[i].address,
                    receive_token_root: tokenRoots[j].address
                }
            });

            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals).toString()} ${tokens[j].symbol}`);

            const payload = await DexPool.call({
                method: 'buildExchangePayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amount: 0,
                    outcoming: tokenRoots[j].address,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectExchangeGas',
                params: {
                    deployWalletValue: 0,
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: tokenWallets3[i],
                method: 'transfer',
                params: {
                    amount: AMOUNT,
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            const expectedDexReceivedAmount = new BigNumber(dexStart.token_balances[j])
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();
            const expectedDexSpentAmount = new BigNumber(dexStart.token_balances[i]).plus(new BigNumber(AMOUNT).shiftedBy(-tokens[i].decimals)).toString();
            const expectedAccountReceivedAmount = new BigNumber(accountStart.token_balances[j])
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[j].decimals)).toString();
            const expectedAccountSpentAmount = new BigNumber(accountStart.token_balances[i]).minus(new BigNumber(AMOUNT).shiftedBy(-tokens[i].decimals)).toString();
            expect(expectedDexSpentAmount).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
            expect(expectedDexReceivedAmount).to.equal(dexEnd.token_balances[j].toString(), `Wrong DEX ${tokens[j].symbol} balance`);
            expect(expectedAccountSpentAmount).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            expect(expectedAccountReceivedAmount).to.equal(accountEnd.token_balances[j].toString(), `Wrong Account#3 ${tokens[j].symbol} balance`);
        });
    });

    describe('Direct deposit liquidity (positive)', async function () {
        it('0050 # Account#3 deposit single coin liquidity (small amount)', async function () {
            let i = 0;

            logger.log('#################################################');
            logger.log(`# Account#3 deposit ${tokens[i].symbol} liquidity (small amount)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            console.log(accountStart);

            let amount = 300 * Math.pow(10, Math.max(tokens[i].decimals - Constants.LP_DECIMALS, 0));

            const LP_REWARD = await expectedDepositLiquidityOneCoin(
                DexPool.address,
                tokens,
                amount,
                tokenRoots[i].address
            );

            const payload = await DexPool.call({
                method: 'buildDepositLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                    expected_amount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS).toString(),
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectDepositGas',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: tokenWallets3[i],
                method: 'transfer',
                params: {
                    amount: amount,
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            })

            displayTx(tx);

            poolLpWallet3.setAddress(await poolLpRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account3.address
                }
            }));

            migration.store(poolLpWallet3, poolName + 'LpWallet3');

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            console.log(accountEnd);
            console.log(LP_REWARD);

            const expectedDexCoin = new BigNumber(dexStart.token_balances[i]).plus(new BigNumber(amount).shiftedBy(-tokens[i].decimals)).toString();
            const expectedAccountCoin = new BigNumber(accountStart.token_balances[i]).minus(new BigNumber(amount).shiftedBy(-tokens[i].decimals)).toString();
            const expectedAccountLp = new BigNumber(accountStart.lp || 0).plus(LP_REWARD).toString();

            expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
            expect(expectedDexCoin).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
            expect(expectedAccountCoin).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            expect(expectedAccountLp).to.equal(accountEnd.lp.toString(), 'Wrong Account#3 LP balance');
        });

        for (let i = 0; i < N_COINS; i++) {
            it('0060 # Account#3 deposit single coin liquidity', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 deposit ${tokens[i].symbol} liquidity`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const TOKENS_TO_DEPOSIT = 300;
                let amount = new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(tokens[i].decimals).toString();

                const LP_REWARD = await expectedDepositLiquidityOneCoin(
                    DexPool.address,
                    tokens,
                    amount,
                    tokenRoots[i].address
                );

                const payload = await DexPool.call({
                    method: 'buildDepositLiquidityPayload', params: {
                        id: 0,
                        deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                        expected_amount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS).toString(),
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectDepositGas',
                    params: {
                        deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: tokenWallets3[i],
                    method: 'transfer',
                    params: {
                        amount: amount,
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                poolLpWallet3.setAddress(await poolLpRoot.call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account3.address
                    }
                }));

                migration.store(poolLpWallet3, poolName + 'LpWallet3');

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexCoin = new BigNumber(dexStart.token_balances[i]).plus(TOKENS_TO_DEPOSIT).toString();
                const expectedAccountCoin = new BigNumber(accountStart.token_balances[i]).minus(TOKENS_TO_DEPOSIT).toString();
                const expectedAccountLp = new BigNumber(accountStart.lp || 0).plus(LP_REWARD).toString();

                expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
                expect(expectedDexCoin).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedAccountCoin).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
                expect(expectedAccountLp).to.equal(accountEnd.lp.toString(), 'Wrong Account#3 LP balance');
            });

            it('0030 # Account#3 direct deposit single coin liquidity (expectedSpendAmount)', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 direct deposit ${tokens[i].symbol} liquidity`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const LP_TO_RECEIVE = 10;

                const expected = await DexPool.call({
                    method: 'expectedDepositSpendAmount', params: {
                        lp_amount: new BigNumber(LP_TO_RECEIVE).shiftedBy(Constants.LP_DECIMALS).toString(),
                        spent_token_root: tokenRoots[i].address
                    }
                });

                logger.log(`Expected spend amount: ${new BigNumber(expected.tokens_amount).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected receive amount: ${LP_TO_RECEIVE} LP`);

                const payload = await DexPool.call({
                    method: 'buildDepositLiquidityPayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: 0,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectDepositGas',
                    params: {
                        deployWalletValue: 0,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: tokenWallets3[i],
                    method: 'transfer',
                    params: {
                        amount: expected.tokens_amount,
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexSpentAmount = new BigNumber(dexStart.token_balances[i])
                    .plus(new BigNumber(expected.tokens_amount).shiftedBy(-tokens[i].decimals)).toString();
                const expectedPoolLp = new BigNumber(poolStart.lp_supply)
                    .plus(LP_TO_RECEIVE).toNumber();
                const expectedAccountSpentAmount = new BigNumber(accountStart.token_balances[i])
                    .minus(new BigNumber(expected.tokens_amount).shiftedBy(-tokens[i].decimals)).toString();
                const expectedAccountReceivedAmount = new BigNumber(accountStart.lp)
                    .plus(LP_TO_RECEIVE).toNumber();

                expect(expectedDexSpentAmount).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedAccountSpentAmount).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
                expect(new BigNumber(poolEnd.lp_supply).toNumber()).to.be.gte(expectedPoolLp, `Wrong DEX LP balance`);
                expect(new BigNumber(accountEnd.lp).toNumber()).to.be.gte(expectedAccountReceivedAmount, `Wrong Account#3 LP balance`);
            });
        }
    });

    describe('Direct withdraw liquidity (positive)', async function () {
        it('0080 # Account#3 direct withdraw liquidity (small amount)', async function () {
            logger.log('#################################################');
            logger.log('# Account#3 direct withdraw liquidity (small amount)');
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const expected = await DexPool.call({
                method: 'expectedWithdrawLiquidity', params: {
                    lp_amount: 1000
                }
            });

            const expectedAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAmount.push(
                    new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals).toString()
                );
            }

            for (let i = 0; i < N_COINS; i++) {
                logger.log(`Expected ${tokens[i].symbol}: ${expectedAmount[i]}`);
            }

            const payload = await DexPool.call({
                method: 'buildWithdrawLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amounts: expected.amounts,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectNoFeeWithdrawGas',
                params: {
                    N: N_COINS,
                    deployWalletValue: 0
                }
            });

            tx = await Account3.runTarget({
                contract: poolLpWallet3,
                method: 'transfer',
                params: {
                    amount: 1000,
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            const expectedDexAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedDexAmount.push(
                    new BigNumber(dexStart.token_balances[i]).minus(expectedAmount[i]).toString()
                );
            }
            const expectedAccountAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAccountAmount.push(
                    new BigNumber(accountStart.token_balances[i]).plus(expectedAmount[i]).toString()
                );
            }

            expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedDexAmount[i]).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
            }
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedAccountAmount[i]).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            }
        });

        it('0090 # Account#3 direct withdraw liquidity', async function () {
            logger.log('#################################################');
            logger.log('# Account#3 direct withdraw liquidity');
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            let LP_AMOUNT = new BigNumber(10).shiftedBy(Constants.LP_DECIMALS);
            const expected = await DexPool.call({
                method: 'expectedWithdrawLiquidity', params: {
                    lp_amount: LP_AMOUNT.toString()
                }
            });

            const expectedAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAmount.push(
                    new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals).toString()
                );
            }

            for (let i = 0; i < N_COINS; i++) {
                logger.log(`Expected ${tokens[i].symbol}: ${expectedAmount[i]}`);
            }

            const payload = await DexPool.call({
                method: 'buildWithdrawLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amounts: expected.amounts,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectNoFeeWithdrawGas',
                params: {
                    N: N_COINS,
                    deployWalletValue: 0
                }
            });

            tx = await Account3.runTarget({
                contract: poolLpWallet3,
                method: 'transfer',
                params: {
                    amount: LP_AMOUNT.toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            const expectedDexAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedDexAmount.push(
                    new BigNumber(dexStart.token_balances[i]).minus(expectedAmount[i]).toString()
                );
            }
            const expectedAccountAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAccountAmount.push(
                    new BigNumber(accountStart.token_balances[i]).plus(expectedAmount[i]).toString()
                );
            }

            expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedDexAmount[i]).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
            }
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedAccountAmount[i]).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            }
        });
    });

    describe('Direct withdraw single coin liquidity (positive)', async function () {
        it('0080 # Account#3 direct withdraw single coin liquidity (small amount)', async function () {
            let i = 0;

            logger.log('#################################################');
            logger.log(`# Account#3 direct withdraw ${tokens[i].symbol} liquidity (small amount)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const LP_AMOUNT = 1000 * Math.pow(10, Math.max(0, Constants.LP_DECIMALS - tokens[i].decimals));

            const expected = await DexPool.call({
                method: 'expectedWithdrawLiquidityOneCoin', params: {
                    lp_amount: LP_AMOUNT,
                    outcoming: tokenRoots[i].address
                }
            });

            logger.log('Lp amount: ', new BigNumber(LP_AMOUNT).shiftedBy(-Constants.LP_DECIMALS).toString());
            logger.log(`Expected amount: ${new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);

            const payload = await DexPool.call({
                method: 'buildWithdrawLiquidityOneCoinPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amount: expected.amounts[i],
                    outcoming: tokenRoots[i].address,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectWithdrawGas',
                params: {
                    numberOfCurrenciesToWithdraw: 1,
                    deployWalletValue: 0,
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: poolLpWallet3,
                method: 'transfer',
                params: {
                    amount: LP_AMOUNT,
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            const expectedDexAmount = new BigNumber(dexStart.token_balances[i])
                .minus(new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals)).toString();
            const expectedAccountAmount = new BigNumber(accountStart.token_balances[i])
                .plus(new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals)).toString();

            expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
            expect(expectedDexAmount).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
            expect(expectedAccountAmount).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
        });

        for (let i = 0; i < N_COINS; i++) {
            it('0090 # Account#3 direct withdraw single coin liquidity', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 direct withdraw ${tokens[i].symbol} liquidity`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);


                let LP_AMOUNT = new BigNumber(10).shiftedBy(Constants.LP_DECIMALS);

                const expected = await DexPool.call({
                    method: 'expectedWithdrawLiquidityOneCoin', params: {
                        lp_amount: LP_AMOUNT.toString(),
                        outcoming: tokenRoots[i].address
                    }
                });

                logger.log('Lp amount: ', new BigNumber(LP_AMOUNT).shiftedBy(-Constants.LP_DECIMALS).toString());
                logger.log(`Expected amount: ${new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);

                const payload = await DexPool.call({
                    method: 'buildWithdrawLiquidityOneCoinPayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: expected.amounts[i],
                        outcoming: tokenRoots[i].address,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectWithdrawGas',
                    params: {
                        numberOfCurrenciesToWithdraw: 1,
                        deployWalletValue: 0,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: poolLpWallet3,
                    method: 'transfer',
                    params: {
                        amount: LP_AMOUNT.toString(),
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexAmount = new BigNumber(dexStart.token_balances[i])
                    .minus(new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals)).toString();
                const expectedAccountAmount = new BigNumber(accountStart.token_balances[i])
                    .plus(new BigNumber(expected.amounts[i]).shiftedBy(-tokens[i].decimals)).toString();

                expect(poolEnd.lp_supply_actual).to.equal(poolEnd.lp_supply, 'Wrong LP supply');
                expect(expectedDexAmount).to.equal(dexEnd.token_balances[i].toString(), `Wrong DEX ${tokens[i].symbol} balance`);
                expect(expectedAccountAmount).to.equal(accountEnd.token_balances[i].toString(), `Wrong Account#3 ${tokens[i].symbol} balance`);
            });

            it('0030 # Account#3 direct withdraw single coin liquidity (expectedSpendAmount)', async function () {
                logger.log('#################################################');
                logger.log(`# Account#3 direct withdraw ${tokens[i].symbol} liquidity`);
                const dexStart = await dexBalances();
                const accountStart = await account3balances();
                const poolStart = await dexPoolInfo();
                logBalances('start', dexStart, accountStart, poolStart);

                const TOKENS_TO_RECEIVE = 100;

                const expected = await DexPool.call({
                    method: 'expectedOneCoinWithdrawalSpendAmount', params: {
                        receive_amount: new BigNumber(TOKENS_TO_RECEIVE).shiftedBy(tokens[i].decimals).toString(),
                        receive_token_root: tokenRoots[i].address
                    }
                });

                logger.log(`Expected spend amount: ${new BigNumber(expected.lp).shiftedBy(-Constants.LP_DECIMALS).toString()} LP`);
                logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[i].decimals).toString()} ${tokens[i].symbol}`);
                logger.log(`Expected receive amount: ${TOKENS_TO_RECEIVE} ${tokens[i].symbol}`);

                const payload = await DexPool.call({
                    method: 'buildWithdrawLiquidityOneCoinPayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: 0,
                        outcoming: tokenRoots[i].address,
                        recipient: Account3.address,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                const gas = await gasValues.call({
                    method: 'getPoolDirectWithdrawGas',
                    params: {
                        numberOfCurrenciesToWithdraw: 1,
                        deployWalletValue: 0,
                        referrer: locklift.utils.zeroAddress
                    }
                });

                tx = await Account3.runTarget({
                    contract: poolLpWallet3,
                    method: 'transfer',
                    params: {
                        amount: expected.lp,
                        recipient: DexPool.address,
                        deployWalletValue: 0,
                        remainingGasTo: Account3.address,
                        notify: true,
                        payload: payload
                    },
                    value: calcValue(gas),
                    keyPair: keyPairs[2]
                });

                displayTx(tx);

                const dexEnd = await dexBalances();
                const accountEnd = await account3balances();
                const poolEnd = await dexPoolInfo();
                logBalances('end', dexEnd, accountEnd, poolEnd);
                await migration.logGas();

                const expectedDexReceivedAmount = new BigNumber(dexStart.token_balances[i])
                    .minus(TOKENS_TO_RECEIVE).toNumber();
                const expectedPoolSpentAmount = new BigNumber(poolStart.lp_supply)
                    .minus(new BigNumber(expected.lp).shiftedBy(-Constants.LP_DECIMALS)).toString();
                const expectedAccountReceivedAmount = new BigNumber(accountStart.token_balances[i])
                    .plus(TOKENS_TO_RECEIVE).toString();
                const expectedAccountSpentAmount = new BigNumber(accountStart.lp)
                    .minus(new BigNumber(expected.lp).shiftedBy(-Constants.LP_DECIMALS)).toString();

                expect(new BigNumber(expectedDexReceivedAmount).toNumber()).to.approximately(
                    new BigNumber(dexEnd.token_balances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
                    `Wrong DEX ${tokens[i].symbol} balance`
                );
                expect(expectedPoolSpentAmount).to.equal(poolEnd.lp_supply.toString(), `Wrong DEX LP balance`);
                expect(new BigNumber(expectedAccountReceivedAmount).toNumber()).to.approximately(
                    new BigNumber(accountEnd.token_balances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
                    `Wrong Account#3 ${tokens[i].symbol} balance`
                );
                expect(new BigNumber(expectedAccountSpentAmount).toNumber()).to.approximately(
                    new BigNumber(accountEnd.lp).toNumber(),
                    new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
                    `Wrong Account#3 LP balance`
                );

            });
        }
    });

    describe('Direct exchange (negative)', async function () {

        let i = 0;
        let j = 1;
        it('0100 # Account#3 exchange Coin_1 to Coin_2 (empty payload)', async function () {
            logger.log('#################################################');
            logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol} (empty payload)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPool.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                    spent_token_root: tokenRoots[i].address,
                    receive_token_root: tokenRoots[j].address
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectExchangeGas',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: tokenWallets3[i],
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: EMPTY_TVM_CELL
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            expect(dexStart.token_balances[i]).to.equal(dexEnd.token_balances[i], `Wrong DEX ${tokens[i].symbol} balance`);
            expect(dexStart.token_balances[j]).to.equal(dexEnd.token_balances[j], `Wrong DEX ${tokens[j].symbol} balance`);
            expect(accountStart.token_balances[i]).to.equal(accountEnd.token_balances[i], `Wrong Account#3 ${tokens[i].symbol} balance`);
            expect(accountStart.token_balances[j]).to.equal(accountEnd.token_balances[j], `Wrong Account#3 ${tokens[j].symbol} balance`);
        });

        it('0110 # Account#3 exchange Coin_1 to Coin_2 (low gas)', async function () {
            logger.log('#################################################');
            logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol} (low gas)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPool.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                    spent_token_root: tokenRoots[i].address,
                    receive_token_root: tokenRoots[j].address
                }
            });

            const payload = await DexPool.call({
                method: 'buildExchangePayload', params: {
                    id: 0,
                    deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                    expected_amount: expected.expected_amount,
                    outcoming: tokenRoots[j].address,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectExchangeGas',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: tokenWallets3[i],
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.foo.decimals).toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas) / 2,
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            expect(dexStart.token_balances[i]).to.equal(dexEnd.token_balances[i], `Wrong DEX ${tokens[i].symbol} balance`);
            expect(dexStart.token_balances[j]).to.equal(dexEnd.token_balances[j], `Wrong DEX ${tokens[j].symbol} balance`);
            expect(accountStart.token_balances[i]).to.equal(accountEnd.token_balances[i], `Wrong Account#3 ${tokens[i].symbol} balance`);
            expect(accountStart.token_balances[j]).to.equal(accountEnd.token_balances[j], `Wrong Account#3 ${tokens[j].symbol} balance`);
        });

        it('0120 # Account#3 exchange Coin_1 to Coin_2 (wrong rate)', async function () {
            logger.log('#################################################');
            logger.log(`# Account#3 exchange ${tokens[i].symbol} to ${tokens[j].symbol} (wrong rate)`);
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolStart = await dexPoolInfo();
            logBalances('start', dexStart, accountStart, poolStart);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPool.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                    spent_token_root: tokenRoots[i].address,
                    receive_token_root: tokenRoots[j].address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} ${tokens[i].symbol}`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.foo.decimals).toString()} ${tokens[i].symbol}`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.bar.decimals).toString()} ${tokens[j].symbol}`);

            const payload = await DexPool.call({
                method: 'buildExchangePayload', params: {
                    id: 0,
                    deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                    expected_amount: new BigNumber(expected.expected_amount).plus(1).toString(),
                    outcoming: tokenRoots[j].address,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                }
            });

            const gas = await gasValues.call({
                method: 'getPoolDirectExchangeGas',
                params: {
                    deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                    referrer: locklift.utils.zeroAddress
                }
            });

            tx = await Account3.runTarget({
                contract: tokenWallets3[i],
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[i].decimals).toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolEnd = await dexPoolInfo();
            logBalances('end', dexEnd, accountEnd, poolEnd);
            await migration.logGas();

            expect(dexStart.token_balances[i]).to.equal(dexEnd.token_balances[i], `Wrong DEX ${tokens[i].symbol} balance`);
            expect(dexStart.token_balances[j]).to.equal(dexEnd.token_balances[j], `Wrong DEX ${tokens[j].symbol} balance`);
            expect(accountStart.token_balances[i]).to.equal(accountEnd.token_balances[i], `Wrong Account#3 ${tokens[i].symbol} balance`);
            expect(accountStart.token_balances[j]).to.equal(accountEnd.token_balances[j], `Wrong Account#3 ${tokens[j].symbol} balance`);
        });
    });
});
