const {expect} = require('chai');
const {
    Migration,
    afterRun,
    Constants,
    getRandomNonce,
    TOKEN_CONTRACTS_PATH,
    displayTx,
    expectedDepositLiquidity
} = require(process.cwd() + '/scripts/utils');
const {Command} = require('commander');
const program = new Command();
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const logger = require('mocha-logger');

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-r, --roots <roots>', 'pool tokens list')
    .option('-a, --amounts <amounts>', 'token amounts')
    .option('-ac, --auto_change <auto_change>', 'auto change')
    .option('-cn, --contract_name <contract_name>', 'DexPool contract name');

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots ? JSON.parse(options.roots) : ['foo', 'bar', 'qwe'];
options.amounts = options.amounts ? JSON.parse(options.amounts) : ['1000000, 1000000, 1000000'];
options.contract_name = options.contract_name || 'DexStablePool';
options.auto_change = options.auto_change || false;

const tokens = [];
let poolName = '';
for (let item of options.roots) {
    poolName += Constants.tokens[item].symbol;
}
const N_COINS = options.roots.length;

let DexRoot;
let DexPool;
let tokenRoots;
let poolLpRoot;
let Account2;
let DexAccount2;
let poolLpWallet2;
let tokenWallets2;

let keyPairs;

async function dexAccountBalances(account) {
    const accountBalances = [];
    for (let i = 0; i < N_COINS; i++) {
        const token = new BigNumber((await account.call({
            method: 'getWalletData', params: {
                token_root: tokenRoots[i].address
            }
        })).balance).shiftedBy(-tokens[i].decimals).toString();

        accountBalances.push(token);
    }
    const lp = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: poolLpRoot.address
        }
    })).balance).shiftedBy(-Constants.LP_DECIMALS).toString();

    const walletBalances = [];
    for (let i = 0; i < N_COINS; i++) {
        let wallet = 0;
        await tokenWallets2[i].call({method: 'balance', params: {}}).then(n => {
            wallet = new BigNumber(n).shiftedBy(-tokens[i].decimals).toString();
        }).catch(e => {/*ignored*/
        });

        walletBalances.push(wallet);
    }

    let walletLp = 0;
    await poolLpWallet2.call({method: 'balance', params: {}}).then(n => {
        walletLp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });

    return {accountBalances, lp, walletBalances, walletLp};
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

describe('DexAccount interact with DexPool', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        if (locklift.tracing) {
            locklift.tracing.allowCodes({compute: [100]});
        }

        DexRoot = await locklift.factory.getContract('DexRoot');
        DexPool = await locklift.factory.getContract(options.contract_name);
        tokenRoots = [];
        let tempTokenRoots = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
            tempTokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        Account2 = await locklift.factory.getAccount('Wallet');
        DexAccount2 = await locklift.factory.getContract('DexAccount');
        poolLpWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        tokenWallets2 = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenWallets2.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
        }

        migration.load(DexRoot, 'DexRoot');
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

        migration.load(poolLpRoot, poolName + 'LpRoot');
        migration.load(Account2, 'Account2');
        migration.load(DexAccount2, 'DexAccount2');

        Account2.afterRun = afterRun;


        if (migration.exists(`${poolName}LpWallet2`)) {
            migration.load(poolLpWallet2, `${poolName}LpWallet2`);
            logger.log(`${poolName}LpWallet#2: ${poolLpWallet2.address}`);
        } else {
            const expected = await poolLpRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account2.address
                }
            });
            poolLpWallet2.setAddress(expected);
            migration.store(poolLpWallet2, `${poolName}LpWallet2`);
            logger.log(`${poolName}LpWallet#2: ${expected} (not deployed)`);
        }

        for (let i = 0; i < N_COINS; i++) {
            if (migration.exists(`${tokens[i].symbol}Wallet2`)) {
                migration.load(tokenWallets2[i], `${tokens[i].symbol}Wallet2`);
                logger.log(`${tokens[i].symbol}Wallet#2: ${tokenWallets2[i].address}`);
            } else {
                const expected = await tokenRoots[i].call({
                    method: 'walletOf',
                    params: {
                        walletOwner: Account2.address
                    }
                });
                tokenWallets2[i].setAddress(expected);
                migration.store(tokenWallets2[i], `${tokens[i].symbol}Wallet2`);
                logger.log(`${tokens[i].symbol}Wallet#2: ${expected} (not deployed)`);
            }
        }

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log(`DexPool${poolName}: ` + DexPool.address);
        for (let i = 0; i < N_COINS; i++) {
            logger.log(`${tokens[i].symbol}Root: ` + tokenRoots[i].address);
        }
        logger.log(`${poolName}LpRoot: ` + poolLpRoot.address);
        logger.log('Account#2: ' + Account2.address);
        logger.log('DexAccount#2: ' + DexAccount2.address);

        await migration.balancesCheckpoint();
    });

    describe('Deposit', async function () {

        it(`Deposit liquidity to ${poolName}`, async function () {
            logger.log('#################################################');
            logger.log(`# Add liquidity to ${poolName}`);
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexPoolInfoStart = await dexPoolInfo();

            let logs = `DexAccount#2 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += dexAccount2Start.accountBalances[i] + ' ' + tokens[i].symbol + ', ';
            }
            logs += dexAccount2Start.lp + ' LP, ' + dexAccount2Start.walletLp + ' LP (wallet)';
            logger.log(logs);

            logs = `DexPool start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += dexPoolInfoStart.token_balances[i] + ' ' + tokens[i].symbol + ', ';
            }
            logs += `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply || "0"} LP, ` +
                    `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual || "0"} LP`;
            logger.log(logs);

            const operations = [];
            const amounts = [];
            for (let i = 0; i < N_COINS; i++) {
                const amount = new BigNumber(options.amounts[i]).shiftedBy(tokens[i].decimals).toString();
                amounts.push(amount);
                operations.push({
                    amount: amount,
                    root: tokenRoots[i].address
                });
            }

            let LP_REWARD = await expectedDepositLiquidity(
                DexPool.address,
                options.contract_name,
                tokens,
                amounts,
                false
            );

            const tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'depositLiquidityV2',
                params: {
                    _callId: getRandomNonce(),
                    _operations: operations,
                    _expected: {
                        amount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS).toString(),
                        root: poolLpRoot.address},
                    _autoChange: options.auto_change,
                    _remainingGasTo: Account2.address
                },
                value: locklift.utils.convertCrystal('1.1', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexPoolInfoEnd = await dexPoolInfo();

            logs = `DexAccount#2 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += dexAccount2End.accountBalances[i] + ' ' + tokens[i].symbol + ', ';
            }
            logs += dexAccount2End.lp + ' LP, ' + dexAccount2End.walletLp + ' LP (wallet)';
            logger.log(logs);

            logs = `DexPool end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += dexPoolInfoEnd.token_balances[i] + ' ' + tokens[i].symbol + ', ';
            }
            logs += `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply || "0"} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual || "0"} LP`;
            logger.log(logs);

            await logGas();

            const expectedAccount2Amount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAccount2Amount.push(
                    new BigNumber(dexAccount2Start.accountBalances[i]).minus(options.amounts[i]).toString()
                );
            }
            let expectedDexAccount2Lp = new BigNumber(dexAccount2Start.lp).toString();
            let expectedAccount2Lp = new BigNumber(dexAccount2Start.walletLp).plus(LP_REWARD).toString();

            const expectedPoolAmount = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedPoolAmount.push(new BigNumber(dexPoolInfoStart.token_balances[i]).plus(options.amounts[i]).toString());
            }
            const expectedPoolLp = new BigNumber(dexPoolInfoStart.lp_supply).plus(LP_REWARD).toString();

            expect(dexPoolInfoEnd.lp_supply_actual).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedAccount2Amount[i]).to.equal(dexAccount2End.accountBalances[i], 'Wrong DexAccount#2 ' + tokens[i].symbol);
            }
            expect(expectedDexAccount2Lp).to.equal(dexAccount2End.lp, 'Wrong DexAccount#2 LP');
            expect(expectedAccount2Lp).to.equal(dexAccount2End.walletLp, 'Wrong Account#2 LP');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedPoolAmount[i]).to.equal(dexPoolInfoEnd.token_balances[i], 'Wrong DexPool ' + tokens[i].symbol);
            }
            expect(expectedPoolLp).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong DexPool LP supply');
        });

    });
});
