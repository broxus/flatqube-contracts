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
options.token_route = options.token_route ? JSON.parse(options.token_route) : ["foo","tst","bar"];
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

    for (const tokenId of options.token_route) {
        balances[tokenId] = await dexWallets[tokenId].call({method: 'balance', params: {}}).then(n => {
            return new BigNumber(n).shiftedBy(-tokens[tokenId].decimals).toString();
        });
    }

    return balances;
}

async function account3balances() {
    const balances = {};

    for (const tokenId of options.token_route) {
        await accountWallets[tokenId].call({method: 'balance', params: {}}).then(n => {
            balances[tokenId] = new BigNumber(n).shiftedBy(-tokens[tokenId].decimals).toString();
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
            balances: token_balances,
            lp_symbol: poolName + 'Lp',
            lp_supply: '0'
        };
    }

    let token_symbols, token_balances, lp_supply;
    if (pool_tokens.length === 2) { // pairs
        const Pool = await locklift.factory.getContract(options.pair_contract_name);

        if (migration.exists(`DexPair${tokens[pool_tokens[0]].symbol}${tokens[pool_tokens[1]].symbol}`)) {
            migration.load(Pool, `DexPair${tokens[pool_tokens[0]].symbol}${tokens[pool_tokens[1]].symbol}`);
        } else {
            migration.load(Pool, `DexPair${tokens[pool_tokens[1]].symbol}${tokens[pool_tokens[0]].symbol}`);
        }
        const poolRoots = await Pool.call({method: 'getTokenRoots', params: {}});
        const balances = await Pool.call({method: 'getBalances', params: {}});

        lp_supply = new BigNumber(balances.lp_supply).shiftedBy(-tokens[poolName + 'Lp'].decimals).toString();

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

        lp_supply = new BigNumber(balances.lp_supply).shiftedBy(-tokens[poolName + 'Lp'].decimals).toString();

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
        balances: token_balances,
        lp_symbol: poolName + 'Lp',
        lp_supply: lp_supply
    };
}

function logBalances(header, dex, account, pools) {
    let dexStr = `DEX balance ${header}: ` + options.token_route.map(r => `${dex[r]} ${tokens[r].symbol}`).join(', ');
    let accountStr = `Account#3 balance ${header}: ` + options.token_route.map(r =>
        `${account[r] || 0} ${tokens[r].symbol}` + (account[r] === undefined ? ' (not deployed)' : '')
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
            logs += `${p.balances[i]} ${p.symbols[i]}, `;
        }
        logs += `${p.lp_supply} ${p.lp_symbol}`;
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

        for (const pool_tokens of options.pool_route) {
            let poolName = '';
            for (let token of pool_tokens) {
                if (token.slice(-2) === 'Lp') {
                    tokens[token] = {name: token, symbol: token, decimals: Constants.LP_DECIMALS, upgradeable: true};
                } else {
                    tokens[token] = Constants.tokens[token];
                }
                poolName += tokens[token].symbol;

                if (tokenRoots[token] === undefined) {
                    const root = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
                    migration.load(root, tokens[token].symbol + 'Root');
                    tokenRoots[token] = root;
                    logger.log(`${tokens[token].symbol}TokenRoot: ${root.address}`);
                }
            }
            tokens[poolName + 'Lp'] = {name: poolName + 'Lp', symbol: poolName + 'Lp', decimals: Constants.LP_DECIMALS, upgradeable: true};

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

        for (const tokenId of options.token_route) {
            const dexWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
            const accountWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

            let tokenName = tokenId.slice(-2) === 'Lp' ? tokenId : Constants.tokens[tokenId].symbol;
            if (tokenRoots[tokenName] === undefined) {
                tokens[tokenName] = {name: tokenName, symbol: tokenName, decimals: Constants.LP_DECIMALS, upgradeable: true};
                const root = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
                migration.load(root, tokenName + 'Root');
                tokenRoots[tokenName] = root;
                logger.log(`${tokenName}TokenRoot: ${root.address}`);
            }
            if (migration.exists(tokenName + 'Wallet3')) {
                migration.load(accountWallet, tokenName + 'Wallet3');
                logger.log(`${tokenName}Wallet#3: ${accountWallet.address}`);
            } else {
                const expectedAccountWallet = await tokenRoots[tokenName].call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account3.address
                    }
                });
                accountWallet.setAddress(expectedAccountWallet);
                logger.log(`${tokenName}Wallet#3: ${expectedAccountWallet} (not deployed)`);
            }

            migration.load(dexWallet, tokenName + 'VaultWallet');
            dexWallets[tokenId] = dexWallet;
            accountWallets[tokenId] = accountWallet;
            logger.log(`${tokenName}VaultWallet: ${dexWallet.address}`);
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
            let currentAmount = new BigNumber(options.amount)
                .shiftedBy(tokens[options.token_route[0]].decimals).toString();

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

                    let expected, expected_amount;
                    let spent_token_idx;
                    if (options.token_route[i - 1].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i - 1])) { // spent token is lp token of the current pool
                        const poolRoots = (await poolsContracts[poolName].call({method: 'getTokenRoots', params: {}})).roots;
                        const outcomingIndex = poolRoots.findIndex((root) => root === tokenRoots[options.token_route[i]].address);

                        expected = await poolsContracts[poolName].call({
                            method: 'expectedWithdrawLiquidityOneCoin', params: {
                                lp_amount: currentAmount,
                                outcoming: tokenRoots[options.token_route[i]].address
                            }
                        });
                        expected_amount = expected.amounts[outcomingIndex];
                    } else if (options.token_route[i].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i])) { // receive token is lp token of the current pool
                        const poolRoots = (await poolsContracts[poolName].call({method: 'getTokenRoots', params: {}})).roots;
                        const amounts = [];
                        for (let idx = 0; idx < poolRoots.length; idx++) {
                            for (let token of options.pool_route[i - 1]) {
                                if (poolRoots[idx] === tokenRoots[token].address) {
                                    if (token === options.token_route[i - 1]) {
                                        amounts.push(currentAmount);
                                        spent_token_idx = idx;
                                    } else {
                                        amounts.push('0');
                                    }
                                    break;
                                }
                            }
                        }

                        expected = await poolsContracts[poolName].call({
                            method: 'expectedDepositLiquidityV2', params: {
                                amounts: amounts,
                            }
                        });
                        expected_amount = expected.lp_reward;
                    } else {
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
                        expected_amount = expected.expected_amount;
                    }

                    console.log()
                    let tokenLeft = tokens[options.token_route[i - 1]];
                    let tokenRight = tokens[options.token_route[i]];
                    let logStr = `${new BigNumber(currentAmount).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    logStr += ' -> ';
                    logStr += `${new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
                    if (options.token_route[i - 1].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i - 1])) { // spent token is lp token of the current pool
                        logStr += `, fee = ${new BigNumber(expected.expected_fee).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
                    } else if (options.token_route[i].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i])) { // receive token is lp token of the current pool
                        logStr += `, fee = ${new BigNumber(expected.pool_fees[spent_token_idx]).plus(expected.beneficiary_fees[spent_token_idx])
                            .shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    } else {
                        logStr += `, fee = ${new BigNumber(expected.expected_fee).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    }
                    logger.log(logStr);

                    steps.push({
                        amount: new BigNumber(expected_amount).dp(0, BigNumber.ROUND_DOWN).toString(),
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
                                new BigNumber(poolsStart[poolName].balances[idx]).minus(new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)).toString()
                            );
                        } else {
                            expected_balances.push(
                                poolsStart[poolName].balances[idx]
                            );
                        }
                    }
                    let expected_lp_supply;
                    if (options.token_route[i - 1].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i - 1])) { // spent token is lp token of the current pool
                        expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply).minus(new BigNumber(currentAmount).shiftedBy(-tokenLeft.decimals)).toString()
                    } else if (options.token_route[i].slice(-2) === 'Lp' && !options.pool_route[i - 1].includes(options.token_route[i])) { // receive token is lp token of the current pool
                        expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply).plus(new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)).toString()
                    } else {
                        expected_lp_supply = poolsStart[poolName].lp_supply;
                    }

                    expectedPoolBalances[poolName] = {lp_supply: expected_lp_supply, balances: expected_balances};

                    currentAmount = expected_amount.toString();
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
                    amount: new BigNumber(options.amount)
                        .shiftedBy(tokens[options.token_route[0]].decimals).toString(),
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
                .shiftedBy(-tokens[lastTokenN].decimals)
                .plus(accountStart[lastTokenN] || 0).toString();

            expect(expectedAccountFirst).to.equal(accountEnd[options.token_route[0]],
                `Account#3 wrong ${tokens[options.token_route[0]].symbol} balance`);
            expect(expectedAccountLast).to.equal(accountEnd[lastTokenN],
                `Account#3 wrong ${tokens[lastTokenN].symbol} balance`);

            let expectedDexLast, expectedDexFirst;
            if (options.token_route[0].slice(-2) === 'Lp' && !options.pool_route[0].includes(options.token_route[0])) { // burn lp token (not transfer to vault)
                expectedDexFirst = new BigNumber(dexStart[options.token_route[0]]).toString();
            } else {
                expectedDexFirst = new BigNumber(dexStart[options.token_route[0]] || 0).plus(options.amount).toString();
            }

            if (lastTokenN.slice(-2) === 'Lp' && !options.pool_route[options.pool_route.length - 1].includes(lastTokenN)) { // mint lp token (not transfer from vault)
                expectedDexLast = new BigNumber(dexStart[lastTokenN]).toString();
            } else {
                expectedDexLast = new BigNumber(dexStart[lastTokenN])
                    .minus(
                        new BigNumber(currentAmount)
                            .shiftedBy(-tokens[lastTokenN].decimals)
                    ).toString();
            }

            expect(expectedDexFirst).to.equal(dexEnd[options.token_route[0]],
                `DexVault wrong ${tokens[options.token_route[0]].symbol} balance`);
            expect(expectedDexLast).to.equal(dexEnd[lastTokenN],
                `DexVault wrong ${tokens[lastTokenN].symbol} balance`);

            for (let poolName in poolsEnd) {
                if (expectedPoolBalances[poolName]) {
                    for (let idx = 0; idx < expectedPoolBalances[poolName].balances.length; idx++) {
                        expect(new BigNumber(poolsEnd[poolName].balances[idx]).toString()).to.equal(expectedPoolBalances[poolName].balances[idx],
                            `DexPair${poolName} wrong ${poolsEnd[poolName].symbols[idx]} balance`);
                    }
                    expect(new BigNumber(poolsEnd[poolName].lp_supply).toString()).to.equal(expectedPoolBalances[poolName].lp_supply,
                        `DexPair${poolName} wrong ${poolsEnd[poolName].lp_symbol} balance`);
                }
            }
        });
    });
});
