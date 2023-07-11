const {expect} = require('chai');
const {Migration, afterRun, Constants, TOKEN_CONTRACTS_PATH, calcValue} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const { Command } = require('commander');
const program = new Command();
const logger = require('mocha-logger');

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-a, --amount <amount>', 'Amount of first token for exchange')
    .option('-st, --start_token <start_token>', 'Spent token')
    .option('-r, --route <route>', 'Exchange route')

program.parse(process.argv);

const options = program.opts();

options.amount = options.amount ? +options.amount : 100;
options.start_token = options.start_token ? options.start_token : 'foo';
options.route = options.route ? JSON.parse(options.route) : [];

console.log(options.route);

let tokens = {};
let DexRoot;
let DexVault;
let Account3;
let poolsContracts = {};
let tokenRoots = {};
let accountWallets = {};
let dexWallets = {};

let keyPairs;

function getPoolName(pool_tokens) {
    return pool_tokens.reduce((acc, token) => acc + tokens[token].symbol, "");
}

function isLpToken(token, pool_roots) {
    return token.slice(-2) === 'Lp' && !pool_roots.includes(token)
}

async function getPoolTokensRoots(poolName, pool_tokens, contract_name) {
    const Pool = poolsContracts[poolName];

    if (contract_name === 'DexPair' || contract_name === 'DexStablePair') { // pairs
        return Pool.call({method: 'getTokenRoots', params: {}});
    } else { // pools
        return (await Pool.call({method: 'getTokenRoots', params: {}})).roots;
    }
}

async function dexBalances() {
    const balances = {};

    balances[options.start_token] = await dexWallets[options.start_token].call({method: 'balance', params: {}}).then(n => {
        return new BigNumber(n).shiftedBy(-tokens[options.start_token].decimals).toString();
    });

    async function getBalance(route) {
        for (let elem of route) {
            balances[elem.outcoming] = await dexWallets[elem.outcoming].call({method: 'balance', params: {}}).then(n => {
                return new BigNumber(n).shiftedBy(-tokens[elem.outcoming].decimals).toString();
            });

            await getBalance(elem.nextSteps);
        }
    }

    await getBalance(options.route);

    return balances;
}

async function account3balances() {
    const balances = {};

    await accountWallets[options.start_token].call({method: 'balance', params: {}}).then(n => {
        balances[options.start_token] = new BigNumber(n).shiftedBy(-tokens[options.start_token].decimals).toString();
    }).catch(e => {/*ignored*/});

    async function getBalance(route) {
        for (let elem of route) {
            await accountWallets[elem.outcoming].call({method: 'balance', params: {}}).then(n => {
                balances[elem.outcoming] = new BigNumber(n).shiftedBy(-tokens[elem.outcoming].decimals).toString();
            }).catch(e => {/*ignored*/});

            await getBalance(elem.nextSteps);
        }
    }

    await getBalance(options.route);

    balances['ton'] = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account3.address)), 'ton').toNumber();
    return balances;
}

async function dexPoolInfo(pool_tokens, contract_name) {
    let poolName = getPoolName(pool_tokens);
    const Pool = poolsContracts[poolName];
    const poolRoots = await getPoolTokensRoots(poolName, pool_tokens, contract_name);

    const balances = await Pool.call({method: 'getBalances', params: {}});
    let lp_supply = new BigNumber(balances.lp_supply).shiftedBy(-tokens[poolName + 'Lp'].decimals).toString();

    let token_symbols, token_balances;
    if (contract_name === 'DexPair' || contract_name === 'DexStablePair') { // pairs

        token_symbols = [tokens[pool_tokens[0]].symbol, tokens[pool_tokens[1]].symbol];
        if (poolRoots.left === tokenRoots[pool_tokens[0]].address) {
            token_balances = [new BigNumber(balances.left_balance).shiftedBy(-tokens[pool_tokens[0]].decimals).toString(),
                new BigNumber(balances.right_balance).shiftedBy(-tokens[pool_tokens[1]].decimals).toString()];
        } else {
            token_balances = [new BigNumber(balances.right_balance).shiftedBy(-tokens[pool_tokens[0]].decimals).toString(),
                new BigNumber(balances.left_balance).shiftedBy(-tokens[pool_tokens[1]].decimals).toString()];
        }

    } else { // pools
        token_symbols = [];
        token_balances = [];

        pool_tokens.forEach(token => {
            const idx = poolRoots.findIndex(token_root => token_root === tokenRoots[token].address);
            token_symbols.push(tokens[token].symbol);
            token_balances.push(new BigNumber(balances.balances[idx]).shiftedBy(-tokens[token].decimals).toString());
        });
    }

    return {
        symbols: token_symbols,
        balances: token_balances,
        lp_symbol: poolName + 'Lp',
        lp_supply: lp_supply
    };
}

function logBalances(header, dex, account, pools) {
    let dexStr = `DEX balance ${header}: ` + Object.keys(dex).map(r => `${dex[r]} ${tokens[r].symbol}`).join(', ');
    let accountStr = `Account#3 balance ${header}: ` + Object.keys(account).filter(r => r !== 'ton').map(r =>
        `${account[r] || 0} ${tokens[r].symbol}` + (account[r] === undefined ? ' (not deployed)' : '')
    ).join(', ');

    accountStr += ', ' + account.ton + ' TON';

    logger.log(dexStr);
    logger.log(accountStr);
    Object.values(pools).forEach(p => {
        let poolName = p.symbols.reduce((acc, token) => acc + token, "");

        let logs = `DexPool#${poolName}: `;
        p.balances.forEach((balance, idx) => logs += `${balance} ${p.symbols[idx]}, `);
        logs += `${p.lp_supply} ${p.lp_symbol}`;
        logger.log(logs);
    });
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

        async function loadPoolsData(route) {
            for (let elem of route) {
                let pool_tokens = elem.roots;

                for (let token of pool_tokens) {
                    if (token.slice(-2) === 'Lp') {
                        tokens[token] = {name: token, symbol: token, decimals: Constants.LP_DECIMALS, upgradeable: true};
                    } else {
                        tokens[token] = Constants.tokens[token];
                    }

                    if (tokenRoots[token] === undefined) {
                        const root = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
                        migration.load(root, tokens[token].symbol + 'Root');
                        tokenRoots[token] = root;
                        logger.log(`${tokens[token].symbol}TokenRoot: ${root.address}`);
                    }
                }
                let poolName = getPoolName(pool_tokens);
                tokens[poolName + 'Lp'] = {name: poolName + 'Lp', symbol: poolName + 'Lp', decimals: Constants.LP_DECIMALS, upgradeable: true};

                let pool = await locklift.factory.getContract(elem.contract_name);
                if (elem.contract_name === 'DexPair' || elem.contract_name === 'DexStablePair') { // pair
                    const tokenLeft = tokens[pool_tokens[0]];
                    const tokenRight = tokens[pool_tokens[1]];
                    if (migration.exists(`DexPool${tokenLeft.symbol}${tokenRight.symbol}`)) {
                        migration.load(pool, `DexPool${tokenLeft.symbol}${tokenRight.symbol}`);
                        logger.log(`DexPool${tokenLeft.symbol}${tokenRight.symbol}: ${pool.address}`);
                    } else if (migration.exists(`DexPool${tokenRight.symbol}${tokenLeft.symbol}`)) {
                        migration.load(pool, `DexPool${tokenRight.symbol}${tokenLeft.symbol}`);
                        logger.log(`DexPool${tokenRight.symbol}${tokenLeft.symbol}: ${pool.address}`);
                    } else {
                        logger.log(`DexPool${tokenLeft.symbol}${tokenRight.symbol} NOT EXISTS`);
                    }
                } else { // pool
                    if (migration.exists(`DexPool${poolName}`)) {
                        migration.load(pool, `DexPool${poolName}`);
                        logger.log(`DexPool${poolName}: ${pool.address}`);
                    } else {
                        logger.log(`DexPool${poolName} NOT EXISTS`);
                    }
                }
                poolsContracts[poolName] = pool;

                await loadPoolsData(elem.nextSteps);
            }
        }
        await loadPoolsData(options.route);


        async function loadSingleTokenData(tokenId) {
            const dexWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
            const accountWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

            let tokenName = tokenId.slice(-2) === 'Lp' && Constants.tokens[tokenId] === undefined ? tokenId : Constants.tokens[tokenId].symbol;
            if (tokenRoots[tokenId] === undefined) {
                tokens[tokenId] = {name: tokenId, symbol: tokenName, decimals: Constants.LP_DECIMALS, upgradeable: true};
                const root = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
                migration.load(root, tokenName + 'Root');
                tokenRoots[tokenId] = root;
                logger.log(`${tokenName}TokenRoot: ${root.address}`);
            }
            if (accountWallets[tokenId] === undefined || dexWallets[tokenId] === undefined) {
                if (migration.exists(tokenName + 'Wallet3')) {
                    migration.load(accountWallet, tokenName + 'Wallet3');
                    logger.log(`${tokenName}Wallet#3: ${accountWallet.address}`);
                } else {
                    const expectedAccountWallet = await tokenRoots[tokenId].call({
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
        }

        async function getRouteTokensInfo(route) {
            for (let elem of route) {
                await loadSingleTokenData(elem.outcoming);

                await getRouteTokensInfo(elem.nextSteps);
            }
        }

        await loadSingleTokenData(options.start_token);
        await getRouteTokensInfo(options.route);

        await migration.balancesCheckpoint();
    });

    describe('Direct split-cross-pool exchange', async function () {
        it('Account#3 split-cross-pool exchange', async function () {
            logger.log('#################################################');

            async function getRouteDexPoolsInfo(route, poolsMap) {
                for (let elem of route) {
                    let poolName = getPoolName(elem.roots);
                    poolsMap[poolName] = await dexPoolInfo(elem.roots, elem.contract_name);

                    await getRouteDexPoolsInfo(elem.nextSteps, poolsMap);
                }
            }

            const dexStart = await dexBalances();
            const accountStart = await account3balances();
            const poolsStart = {};

            await getRouteDexPoolsInfo(options.route, poolsStart);

            logBalances('start', dexStart, accountStart, poolsStart);

            const expectedPoolBalances = {};
            const steps = [];
            let currentAmount = new BigNumber(options.amount)
                .shiftedBy(tokens[options.start_token].decimals).toString();


            let finalExpectedAmount = new BigNumber(0);
            let lastTokenN;
            let lastStepPools = [];

            // Calculate expected result
            logger.log(`### EXPECTED ###`);

            async function getExpectedAmount(route, spent_token, spent_amount) {
                let denominator = route.reduce((partialSum, elem) => partialSum + elem.numerator, 0);

                let next_indices = [];

                for (let elem of route) {
                    let pool_roots = elem.roots.map(token => tokenRoots[token].address);
                    let poolName = getPoolName(elem.roots);
                    const poolRoots = await getPoolTokensRoots(poolName, elem.roots, elem.contract_name);

                    let partial_spent_amount = (new BigNumber(spent_amount)).multipliedBy(elem.numerator).dividedToIntegerBy(denominator).toString();

                    let expected, expected_amount;
                    if (isLpToken(spent_token, elem.roots)) { // spent token is lp token of the current pool
                        const outcomingIndex = poolRoots.findIndex((root) => root === tokenRoots[elem.outcoming].address);

                        expected = await poolsContracts[poolName].call({
                            method: 'expectedWithdrawLiquidityOneCoin', params: {
                                lp_amount: partial_spent_amount,
                                outcoming: tokenRoots[elem.outcoming].address
                            }
                        });
                        expected_amount = expected.amounts[outcomingIndex];
                    } else if (isLpToken(elem.outcoming, elem.roots)) { // receive token is lp token of the current pool

                        expected = await poolsContracts[poolName].call({
                            method: 'expectedDepositLiquidityOneCoin', params: {
                                spent_token_root: tokenRoots[spent_token].address,
                                amount: partial_spent_amount
                            }
                        });
                        expected_amount = expected.lp_reward;
                    } else {
                        if (elem.contract_name === 'DexPair' || elem.contract_name === 'DexStablePair') { // pair
                            expected = await poolsContracts[poolName].call({
                                method: 'expectedExchange', params: {
                                    amount: partial_spent_amount,
                                    spent_token_root: tokenRoots[spent_token].address
                                }
                            });
                        } else { // pool
                            expected = await poolsContracts[poolName].call({
                                method: 'expectedExchange', params: {
                                    amount: partial_spent_amount,
                                    spent_token_root: tokenRoots[spent_token].address,
                                    receive_token_root: tokenRoots[elem.outcoming].address
                                }
                            });
                        }
                        expected_amount = expected.expected_amount;
                    }

                    console.log()
                    let tokenLeft = tokens[spent_token];
                    let tokenRight = tokens[elem.outcoming];
                    let logStr = `${new BigNumber(partial_spent_amount).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    logStr += ' -> ';
                    logStr += `${new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
                    if (isLpToken(spent_token, elem.roots)) { // spent token is lp token of the current pool
                        logStr += `, fee = ${new BigNumber(expected.expected_fee).shiftedBy(-tokenRight.decimals)} ${tokenRight.symbol}`;
                    } else if (isLpToken(elem.outcoming, elem.roots)) { // receive token is lp token of the current pool
                        const pool_tokens = poolRoots.map(token_root => elem.roots.find(token => token_root === tokenRoots[token].address));

                        expected.pool_fees.forEach((pool_fee, idx) => logStr += `, fee = ${new BigNumber(pool_fee).plus(expected.beneficiary_fees[idx])
                            .shiftedBy(-tokens[pool_tokens[idx]].decimals)} ${tokens[pool_tokens[idx]].symbol}` );
                    } else {
                        logStr += `, fee = ${new BigNumber(expected.expected_fee).shiftedBy(-tokenLeft.decimals)} ${tokenLeft.symbol}`;
                    }
                    logger.log(logStr);


                    const expected_balances = [];
                    elem.roots.forEach((root, idx) => {
                        if (root === spent_token) {
                            expected_balances.push(
                                new BigNumber(partial_spent_amount).shiftedBy(-tokenLeft.decimals).plus(poolsStart[poolName].balances[idx]).toString()
                            );
                        } else if (root === elem.outcoming) {
                            expected_balances.push(
                                new BigNumber(poolsStart[poolName].balances[idx]).minus(new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)).toString()
                            );
                        } else {
                            expected_balances.push(
                                poolsStart[poolName].balances[idx]
                            );
                        }
                    });
                    let expected_lp_supply;
                    if (isLpToken(spent_token, elem.roots)) { // spent token is lp token of the current pool
                        expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply).minus(new BigNumber(partial_spent_amount).shiftedBy(-tokenLeft.decimals)).toString()
                    } else if (isLpToken(elem.outcoming, elem.roots)) { // receive token is lp token of the current pool
                        expected_lp_supply = new BigNumber(poolsStart[poolName].lp_supply).plus(new BigNumber(expected_amount).shiftedBy(-tokenRight.decimals)).toString()
                    } else {
                        expected_lp_supply = poolsStart[poolName].lp_supply;
                    }

                    expectedPoolBalances[poolName] = {lp_supply: expected_lp_supply, balances: expected_balances};

                    let next_step_indices = await getExpectedAmount(elem.nextSteps, elem.outcoming, expected_amount.toString());

                    steps.push({
                        amount: expected_amount.toString(),
                        roots: pool_roots,
                        outcoming: tokenRoots[elem.outcoming].address,
                        numerator: elem.numerator,
                        nextStepIndices: next_step_indices
                    });

                    next_indices.push(steps.length - 1);

                    if (!elem.nextSteps.length) {
                        lastStepPools.push({roots: elem.roots, amount: expected_amount.toString()})
                    }
                }

                if (!route.length) {
                    finalExpectedAmount = finalExpectedAmount.plus(spent_amount);
                    lastTokenN = spent_token;
                }

                return next_indices;
            }

            let next_indices = await getExpectedAmount(options.route, options.start_token, currentAmount);

            logger.log('');

            let poolName = getPoolName(options.route[0].roots);
            const firstPool = poolsContracts[poolName];

            let payload;
            if (options.route[0].contract_name === 'DexPair' || options.route[0].contract_name === 'DexStablePair') { // pair
                const params = {
                    _id: 0,
                    _deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                    _expectedAmount: steps[next_indices[0]].amount,
                    _outcoming: steps[next_indices[0]].outcoming,
                    _nextStepIndices: steps[next_indices[0]].nextStepIndices,
                    _steps: steps,
                    _recipient: Account3.address,
                    _referrer: locklift.utils.zeroAddress
                };

                logger.log(`Call buildCrossPairExchangePayloadV2(${JSON.stringify(params, null, 4)})`);

                payload = await firstPool.call({
                    method: 'buildCrossPairExchangePayloadV2', params
                });
            } else { // pool
                const params = {
                    id: 0,
                    deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                    expectedAmount: steps[next_indices[0]].amount,
                    outcoming: steps[next_indices[0]].outcoming,
                    nextStepIndices: steps[next_indices[0]].nextStepIndices,
                    steps: steps,
                    recipient: Account3.address,
                    referrer: locklift.utils.zeroAddress
                };

                logger.log(`Call buildCrossPairExchangePayload(${JSON.stringify(params, null, 4)})`);

                payload = await firstPool.call({
                    method: 'buildCrossPairExchangePayload', params
                });
            }
            logger.log(`Result payload = ${payload}`);

            const gasValues = migration.load(await locklift.factory.getContract('DexGasValues'), 'DexGasValues');
            const gas = await gasValues.call({
                method: 'getPoolCrossExchangeGas',
                params: {
                    steps: steps.length,
                    leaves: lastStepPools.length,
                    deployWalletValue: locklift.utils.convertCrystal('0.05', 'nano'),
                    referrer: locklift.utils.zeroAddress
                }
            });

            await Account3.runTarget({
                contract: accountWallets[options.start_token],
                method: 'transfer',
                params: {
                    amount: new BigNumber(options.amount)
                        .shiftedBy(tokens[options.start_token].decimals).toString(),
                    recipient: firstPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account3.address,
                    notify: true,
                    payload: payload
                },
                value: calcValue(gas),
                keyPair: keyPairs[2]
            });

            const dexEnd = await dexBalances();
            const accountEnd = await account3balances();
            const poolsEnd = {};

            await getRouteDexPoolsInfo(options.route, poolsEnd);

            logBalances('end', dexEnd, accountEnd, poolsEnd);
            await migration.logGas();

            console.log('lastTokenN', lastTokenN);

            const expectedAccountFirst = new BigNumber(accountStart[options.start_token] || 0).minus(options.amount).toString();
            const expectedAccountLast = new BigNumber(finalExpectedAmount)
                .shiftedBy(-tokens[lastTokenN].decimals)
                .plus(accountStart[lastTokenN] || 0).toString();

            expect(expectedAccountFirst).to.equal(accountEnd[options.start_token],
                `Account#3 wrong ${tokens[options.start_token].symbol} balance`);
            expect(expectedAccountLast).to.equal(accountEnd[lastTokenN],
                `Account#3 wrong ${tokens[lastTokenN].symbol} balance`);

            let expectedDexLast, expectedDexFirst;
            if (isLpToken(options.start_token, options.route[0].roots)) { // burn lp token (not transfer to vault)
                expectedDexFirst = new BigNumber(dexStart[options.start_token]).toString();
            } else {
                expectedDexFirst = new BigNumber(dexStart[options.start_token] || 0).plus(options.amount).toString();
            }

            expectedDexLast = new BigNumber(dexStart[lastTokenN]);
            // mint lp token (not transfer from vault)
            lastStepPools.filter(lastPool => !isLpToken(lastTokenN, lastPool.roots)).forEach(lastPool => {
                expectedDexLast = expectedDexLast.minus(
                    new BigNumber(lastPool.amount).shiftedBy(-tokens[lastTokenN].decimals)
                );
            });

            expect(expectedDexFirst).to.equal(dexEnd[options.start_token],
                `DexVault wrong ${tokens[options.start_token].symbol} balance`);
            expect(expectedDexLast.toString()).to.equal(dexEnd[lastTokenN],
                `DexVault wrong ${tokens[lastTokenN].symbol} balance`);

            Object.entries(poolsEnd).filter((poolName, pool) => expectedPoolBalances[poolName]).forEach((poolName, pool) => {
                expectedPoolBalances[poolName].balances.forEach((expected_balance, idx) =>
                    expect(new BigNumber(pool.balances[idx]).toString()).to.equal(expected_balance,
                        `DexPool${poolName} wrong ${pool.symbols[idx]} balance`)
                );
                expect(new BigNumber(pool.lp_supply).toString()).to.equal(expectedPoolBalances[poolName].lp_supply,
                    `DexPool${poolName} wrong ${pool.lp_symbol} balance`);
            });
        });
    });
});
