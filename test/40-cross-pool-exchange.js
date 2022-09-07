const {expect} = require('chai');
const {Migration, afterRun, Constants, TOKEN_CONTRACTS_PATH} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const { Command } = require('commander');
const program = new Command();
const logger = require('mocha-logger');

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-a, --amount <amount>', 'Amount of first token for exchange')
    .option('-pr, --pool_route <pool_route>', 'Array of pools roots')
    .option('-tr, --token_route <token_route>', 'Array of tokens')

    .option('-wp, --wrong_pool <wrong_pool>', 'Expected last success step token')
    .option('-prcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-plcn, --pool_contract_name <pool_contract_name>', 'DexPool contract name')

program.parse(process.argv);

const options = program.opts();

options.amount = options.amount ? +options.amount : 100;
options.token_route = options.token_route ? JSON.parse(options.token_route) : ['foo', 'tst', 'bar'];
options.pool_route = options.pool_route ? JSON.parse(options.pool_route) : [["foo","tst"],["bar","tst"]];
options.wrong_pool = options.wrong_pool ? JSON.parse(options.wrong_pool) : [];
options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.pool_contract_name = options.pool_contract_name || 'DexStablePool';

console.log(options);

let tokens = {};
let DexRoot;
let DexVault;
let Account3;
let poolsContracts = {};
let tokenRoots = {};
let accountWallets = {};
let dexWallets = {};

let keyPairs;

async function dexBalances() {
    const balances = {};

    for (const r of options.token_route) {
        balances[r] = await dexWallets[r].call({method: 'balance', params: {}}).then(n => {
            return new BigNumber(n).shiftedBy(-Constants.tokens[r].decimals).toString();
        });
    }

    return balances;
}

async function account3balances() {
    const balances = {};

    for (const r of options.token_route) {
        await accountWallets[r].call({method: 'balance', params: {}}).then(n => {
            balances[r] = new BigNumber(n).shiftedBy(-Constants.tokens[r].decimals).toString();
        }).catch(e => {/*ignored*/});
    }

    balances['ton'] = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account3.address)), 'ton').toNumber();
    return balances;
}

async function dexPoolInfo(pool_tokens) {
    let poolName = '';
    for (let token of pool_tokens) {
        poolName += tokens[token].symbol;
    }
    let isWrongPool = true;
    if (options.wrong_pool.length !== pool_tokens.length) {
        isWrongPool = false;
    } else {
        for (let i = 0; i < options.wrong_pool.length; i++) {
            if (pool_tokens[i] !== options.wrong_pool[i]) {
                isWrongPool = false;
            }
        }
    }

    if (isWrongPool) {
        let token_symbols = [];
        let token_balances = [];

        for (let token of pool_tokens) {
            token_symbols.push(tokens[token].symbol);
            token_balances.push('0');
        }
        return {
            symbols: token_symbols,
            balances: token_balances
        };
    }

    let token_symbols, token_balances;
    if (pool_tokens.length === 2) { // pairs
        const Pool = await locklift.factory.getContract(options.pair_contract_name);

        if (migration.exists(`DexPair${tokens[pool_tokens[0]].symbol}${tokens[pool_tokens[1]].symbol}`)) {
            migration.load(Pool, `DexPair${tokens[pool_tokens[0]].symbol}${tokens[pool_tokens[1]].symbol}`);
        } else {
            migration.load(Pool, `DexPair${tokens[pool_tokens[1]].symbol}${tokens[pool_tokens[0]].symbol}`);
        }
        const poolRoots = await Pool.call({method: 'getTokenRoots', params: {}});
        const balances = await Pool.call({method: 'getBalances', params: {}});

        token_symbols = [tokens[pool_tokens[0]].symbol, tokens[pool_tokens[1]].symbol];
        if (poolRoots.left === tokenRoots[pool_tokens[0]].address) {
            token_balances = [new BigNumber(balances.left_balance).shiftedBy(-tokens[pool_tokens[0]].decimals).toString(),
                              new BigNumber(balances.right_balance).shiftedBy(-tokens[pool_tokens[1]].decimals).toString()];
        } else {
            token_balances = [new BigNumber(balances.right_balance).shiftedBy(-tokens[pool_tokens[0]].decimals).toString(),
                              new BigNumber(balances.left_balance).shiftedBy(-tokens[pool_tokens[1]].decimals).toString()];
        }
    } else { // pools
        const Pool = await locklift.factory.getContract(options.pool_contract_name);

        migration.load(Pool, `DexPool${poolName}`);
        const poolRoots = (await Pool.call({method: 'getTokenRoots', params: {}})).roots;
        const balances = await Pool.call({method: 'getBalances', params: {}});

        token_symbols = [];
        token_balances = [];
        for (let token of pool_tokens) {
            for (let i = 0; i < poolRoots.length; i++) {
                if (tokenRoots[token].address === poolRoots[i]) {
                    token_symbols.push(tokens[token].symbol);
                    token_balances.push(new BigNumber(balances.balances[i]).shiftedBy(-tokens[token].decimals).toString());

                    break;
                }
            }
        }
    }

    return {
        symbols: token_symbols,
        balances: token_balances
    };
}

function logBalances(header, dex, account, pools) {
    let dexStr = `DEX balance ${header}: ` + options.token_route.map(r => `${dex[r]} ${Constants.tokens[r].symbol}`).join(', ');
    let accountStr = `Account#3 balance ${header}: ` + options.token_route.map(r =>
        `${account[r] || 0} ${Constants.tokens[r].symbol}` + (account[r] === undefined ? ' (not deployed)' : '')
    ).join(', ');

    accountStr += ', ' + account.ton + ' TON';

    logger.log(dexStr);
    logger.log(accountStr);
    Object.values(pools).forEach(p => {
        let poolName = '';
        for (let symbol of p.symbols) {
            poolName += symbol;
        }

        let logs = `DexPool#${poolName}: `;
        for (let i = 0; i < p.symbols.length; i++) {
            logs += `${p.balances[i]} ${p.symbols[i]}`;
            logs += i === p.symbols.length ? '.' : ', ';
        }
        logger.log(logs);
    });
}

async function logGas() {
    await migration.balancesCheckpoint();
    const diff = await migration.balancesLastDiff();
    if (diff) {
        logger.log(`### GAS STATS ###`);
        for (let alias in diff) {
            logger.log(`${alias}: ${diff[alias].gt(0) ? '+' : ''}${diff[alias].toFixed(9)} TON`);
        }
    }
}

describe('Check direct operations', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        DexRoot = await locklift.factory.getContract('DexRoot');
        DexVault = await locklift.factory.getContract('DexVault');
        Account3 = await locklift.factory.getAccount('Wallet');
        Account3.afterRun = afterRun;

        migration.load(DexRoot, 'DexRoot');
        migration.load(DexVault, 'DexVault');
        migration.load(Account3, 'Account3');

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log('DexVault: ' + DexVault.address);
        logger.log('Account#3: ' + Account3.address);

        for (const tokenId of options.token_route) {
            const dexWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
            const accountWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

            if (migration.exists(Constants.tokens[tokenId].symbol + 'Wallet3')) {
                migration.load(accountWallet, Constants.tokens[tokenId].symbol + 'Wallet3');
                logger.log(`${Constants.tokens[tokenId].symbol}Wallet#3: ${accountWallet.address}`);
            } else {
                const expectedAccountWallet = await root.call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account3.address
                    }
                });
                accountWallet.setAddress(expectedAccountWallet);
                logger.log(`${Constants.tokens[tokenId].symbol}Wallet#3: ${expectedAccountWallet} (not deployed)`);
            }

            migration.load(dexWallet, Constants.tokens[tokenId].symbol + 'VaultWallet');
            dexWallets[tokenId] = dexWallet;
            accountWallets[tokenId] = accountWallet;
            logger.log(`${Constants.tokens[tokenId].symbol}VaultWallet: ${dexWallet.address}`);
        }
        for (const pool_tokens of options.pool_route) {
            let poolName = '';
            for (let token of pool_tokens) {
                tokens[token] = Constants.tokens[token];
                poolName += tokens[token].symbol;

                if (tokenRoots[token] === undefined) {
                    const root = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
                    migration.load(root, Constants.tokens[token].symbol + 'Root');
                    tokenRoots[token] = root;
                    logger.log(`${Constants.tokens[token].symbol}TokenRoot: ${root.address}`);
                }
            }

            let pool;
            if (pool_tokens.length === 2) { // pair
                pool = await locklift.factory.getContract(options.pair_contract_name);

                const tokenLeft = tokens[pool_tokens[0]];
                const tokenRight = tokens[pool_tokens[1]];
                if (migration.exists(`DexPair${tokenLeft.symbol}${tokenRight.symbol}`)) {
                    migration.load(pool, `DexPair${tokenLeft.symbol}${tokenRight.symbol}`);
                    logger.log(`DexPair${tokenLeft.symbol}${tokenRight.symbol}: ${pool.address}`);
                } else if (migration.exists(`DexPair${tokenRight.symbol}${tokenLeft.symbol}`)) {
                    migration.load(pool, `DexPair${tokenRight.symbol}${tokenLeft.symbol}`);
                    logger.log(`DexPair${tokenRight.symbol}${tokenLeft.symbol}: ${pool.address}`);
                } else {
                    logger.log(`DexPair${tokenLeft.symbol}${tokenRight.symbol} NOT EXISTS`);
                }
            } else { // pool
                pool = await locklift.factory.getContract(options.pool_contract_name);

                if (migration.exists(`DexPool${poolName}`)) {
                    migration.load(pool, `DexPool${poolName}`);
                    logger.log(`DexPool${poolName}: ${pool.address}`);
                } else {
                    logger.log(`DexPool${poolName} NOT EXISTS`);
                }
            }
            poolsContracts[poolName] = pool;
        }

        await migration.balancesCheckpoint();
    });

    describe('Direct cross-pair exchange', async function () {
        it('Account#3 cross-pool exchange', async function () {
            logger.log('#################################################');
            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolsStart = {};
            for (const pool_tokens of options.pool_route) {
                let poolName = '';
                for (let token of pool_tokens) {
                    poolName += tokens[token].symbol;
                }
                poolsStart[poolName] = await dexPoolInfo(pool_tokens);
            }
            logBalances('start', dexStart, accountStart, poolsStart);

            const expectedPoolBalances = {};
            const steps = [];
            let currentAmount = new BigNumber(options.amount).shiftedBy(Constants.tokens[options.token_route[0]].decimals).toString();

            // Calculate expected result
            logger.log(`### EXPECTED ###`);
            let error = false;
            for (let i = 1; i < options.token_route.length; i++) {
                let pool_roots = [];
                for (let token of options.pool_route[i - 1]) {
                    pool_roots.push(tokenRoots[token].address);
                }

                let isWrongPool = true;
                if (options.wrong_pool.length !== options.pool_route[i - 1].length) {
                    isWrongPool = false;
                } else {
                    for (let idx = 0; idx < options.wrong_pool.length; idx++) {
                        if (options.pool_route[i - 1][idx] !== options.wrong_pool[idx]) {
                            isWrongPool = false;
                        }
                    }
                }
                if (isWrongPool) {
                    error = true;
                }

                if (error) {
                    steps.push({
                        amount: '0',
                        roots: pool_roots,
                        outcoming: tokenRoots[options.token_route[i]].address,
                    });
                } else {
                    let poolName = '';
                    for (let token of options.pool_route[i - 1]) {
                        poolName += tokens[token].symbol;
                    }
                    let expected;
                    if (options.pool_route[i - 1].length === 2) { // pair
                        expected = await poolsContracts[poolName].call({
                            method: 'expectedExchange', params: {
                                amount: currentAmount,
                                spent_token_root: tokenRoots[options.token_route[i - 1]].address
                            }
                        });
                    } else { // pool
                        expected = await poolsContracts[poolName].call({
                            method: 'expectedExchange', params: {
                                amount: currentAmount,
                                spent_token_root: tokenRoots[options.token_route[i - 1]].address,
                                receive_token_root: tokenRoots[options.token_route[i]].address
                            }
                        });
                    }
                    console.log()
                    let tokenLeft = tokens[options.token_route[i - 1]];
                    let tokenRight = tokens[options.token_route[i]];
                    let logStr = `${new BigNumber(currentAmount).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    logStr += ' -> ';
                    logStr += `${new BigNumber(expected.expected_amount).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
                    logStr += `, fee = ${new BigNumber(expected.expected_fee).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    logger.log(logStr);

                    steps.push({
                        amount: new BigNumber(expected.expected_amount).dp(0, BigNumber.ROUND_DOWN).toString(),
                        roots: pool_roots,
                        outcoming: tokenRoots[options.token_route[i]].address
                    });

                    const expected_balances = [];
                    for (let idx = 0; idx < options.pool_route[i - 1].length; idx++) {
                        if (options.pool_route[i - 1][idx] === options.token_route[i - 1]) {
                            expected_balances.push(
                                new BigNumber(currentAmount).shiftedBy(-tokenLeft.decimals).plus(poolsStart[poolName].balances[idx]).toString()
                            );
                        } else if (options.pool_route[i - 1][idx] === options.token_route[i]) {
                            expected_balances.push(
                                new BigNumber(poolsStart[poolName].balances[idx]).minus(new BigNumber(expected.expected_amount).shiftedBy(-tokenRight.decimals)).toString()
                            );
                        } else {
                            expected_balances.push(
                                poolsStart[poolName].balances[idx]
                            );
                        }
                    }
                    expectedPoolBalances[poolName] = expected_balances;

                    currentAmount = expected.expected_amount.toString();
                }
            }
            logger.log('');

            let poolName = '';
            for (let token of options.pool_route[0]) {
                poolName += tokens[token].symbol;
            }

            const firstPool = poolsContracts[poolName];

            let payload;
            if (options.pool_route[0].length === 2) { // pair
                const params = {
                    _id: 0,
                    _deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                    _expectedAmount: steps[0].amount,
                    _outcoming: steps[0].outcoming,
                    _steps: steps.slice(1)
                };

                logger.log(`Call buildCrossPairExchangePayloadV2(${JSON.stringify(params, null, 4)})`);

                payload = await firstPool.call({
                    method: 'buildCrossPairExchangePayloadV2', params
                });
            } else { // pool
                const params = {
                    id: 0,
                    deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                    expectedAmount: steps[0].amount,
                    outcoming: steps[0].outcoming,
                    steps: steps.slice(1)
                };

                logger.log(`Call buildCrossPairExchangePayload(${JSON.stringify(params, null, 4)})`);

                payload = await firstPool.call({
                    method: 'buildCrossPairExchangePayload', params
                });
            }
            logger.log(`Result payload = ${payload}`);

            await Account3.runTarget({
                contract: accountWallets[options.token_route[0]],
                method: 'transfer',
                params: {
                    amount: new BigNumber(options.amount).shiftedBy(Constants.tokens[options.token_route[0]].decimals).toString(),
                    recipient: firstPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal(options.token_route.length + 3, 'nano'),
                keyPair: keyPairs[2]
            });

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolsEnd = {};
            for (let pool_tokens of options.pool_route) {
                let poolName = '';
                for (let token of pool_tokens) {
                    poolName += tokens[token].symbol;
                }
                poolsEnd[poolName] = await dexPoolInfo(pool_tokens);
            }
            logBalances('end', dexEnd, accountEnd, poolsEnd);
            await logGas();

            const lastTokenN = options.wrong_pool && options.wrong_pool.length > 0 ? options.wrong_pool[0] : options.token_route[options.token_route.length - 1];

            console.log('lastTokenN', lastTokenN);

            const expectedAccountFirst = new BigNumber(accountStart[options.token_route[0]] || 0).minus(options.amount).toString();
            const expectedAccountLast = new BigNumber(currentAmount)
                .shiftedBy(-Constants.tokens[lastTokenN].decimals)
                .plus(accountStart[lastTokenN] || 0).toString();

            expect(expectedAccountFirst).to.equal(accountEnd[options.token_route[0]],
                `Account#3 wrong ${Constants.tokens[options.token_route[0]].symbol} balance`);
            expect(expectedAccountLast).to.equal(accountEnd[lastTokenN],
                `Account#3 wrong ${Constants.tokens[lastTokenN].symbol} balance`);

            const expectedDexFirst = new BigNumber(dexStart[options.token_route[0]] || 0).plus(options.amount).toString();
            const expectedDexLast = new BigNumber(dexStart[lastTokenN])
                .minus(
                    new BigNumber(currentAmount)
                        .shiftedBy(-Constants.tokens[lastTokenN].decimals)
                ).toString();

            expect(expectedDexFirst).to.equal(dexEnd[options.token_route[0]],
                `DexVault wrong ${Constants.tokens[options.token_route[0]].symbol} balance`);
            expect(expectedDexLast).to.equal(dexEnd[lastTokenN],
                `DexVault wrong ${Constants.tokens[lastTokenN].symbol} balance`);


            for (let poolName in poolsEnd) {
                if (expectedPoolBalances[poolName]) {
                    for (let idx = 0; idx < expectedPoolBalances[poolName].length; idx++) {
                        expect(new BigNumber(poolsEnd[poolName].balances[idx]).toString()).to.equal(expectedPoolBalances[poolName][idx],
                            `DexPair${poolName} wrong ${poolsEnd[poolName].symbols[idx]} balance`);
                    }
                }
            }
        });
    });
});
