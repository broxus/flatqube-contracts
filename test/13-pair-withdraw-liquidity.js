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
    .option('-lr, --left_token_id <left_token_id>', 'left token id')
    .option('-rr, --right_token_id <right_token_id>', 'right token id')
    .option('-cn, --contract_name <contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();

options.left_token_id = options.left_token_id || 'foo';
options.right_token_id = options.right_token_id || 'bar';
options.contract_name = options.contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';

const left_token = options.left_token_id.slice(-2) === 'Lp' ? {name: options.left_token_id, symbol: options.left_token_id, decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[options.left_token_id];
const right_token = options.right_token_id.slice(-2) === 'Lp' ? {name: options.right_token_id, symbol: options.right_token_id, decimals: Constants.LP_DECIMALS, upgradeable: true} : Constants.tokens[options.right_token_id];

let DexRoot;
let DexPairFooBar;
let FooRoot;
let BarRoot;
let FooBarLpRoot;
let Account2;
let FooVaultWallet;
let BarVaultWallet;
let FooBarLpVaultWallet;
let DexAccount2;
let FooBarLpWallet2;
let BarWallet2;
let FooWallet2;

let IS_FOO_LEFT;

let keyPairs;

async function dexAccountBalances(account) {
    const foo = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: FooRoot.address
        }
    })).balance).shiftedBy(-left_token.decimals).toString();
    const bar = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: BarRoot.address
        }
    })).balance).shiftedBy(-right_token.decimals).toString();
    const lp = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: FooBarLpRoot.address
        }
    })).balance).shiftedBy(-Constants.LP_DECIMALS).toString();

    let walletFoo = 0;
    await FooWallet2.call({method: 'balance', params: {}}).then(n => {
        walletFoo = new BigNumber(n).shiftedBy(-left_token.decimals).toString();
    }).catch(e => {/*ignored*/
    });
    let walletBar = 0;
    await BarWallet2.call({method: 'balance', params: {}}).then(n => {
        walletBar = new BigNumber(n).shiftedBy(-right_token.decimals).toString();
    }).catch(e => {/*ignored*/
    });
    let walletLp = 0;
    await FooBarLpWallet2.call({method: 'balance', params: {}}).then(n => {
        walletLp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });

    return {foo, bar, lp, walletFoo, walletBar, walletLp};
}

async function dexPairInfo() {
    const balances = await DexPairFooBar.call({method: 'getBalances', params: {}});
    const total_supply = await FooBarLpRoot.call({method: 'totalSupply', params: {}});
    let foo, bar;
    if (IS_FOO_LEFT) {
        foo = new BigNumber(balances.left_balance).shiftedBy(-left_token.decimals).toString();
        bar = new BigNumber(balances.right_balance).shiftedBy(-right_token.decimals).toString();
    } else {
        foo = new BigNumber(balances.right_balance).shiftedBy(-left_token.decimals).toString();
        bar = new BigNumber(balances.left_balance).shiftedBy(-right_token.decimals).toString();
    }

    return {
        foo: foo,
        bar: bar,
        lp_supply: new BigNumber(balances.lp_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        lp_supply_actual: new BigNumber(total_supply).shiftedBy(-Constants.LP_DECIMALS).toString()
    };
}

async function account2balances() {
    let foo;
    await FooWallet2.call({method: 'balance', params: {}}).then(n => {
        foo = new BigNumber(n).shiftedBy(-Constants.tokens.foo.decimals).toString();
    }).catch(e => {/*ignored*/
    });
    let bar;
    await BarWallet2.call({method: 'balance', params: {}}).then(n => {
        bar = new BigNumber(n).shiftedBy(-Constants.tokens.bar.decimals).toString();
    }).catch(e => {/*ignored*/
    });
    let lp;
    await FooBarLpWallet2.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account2.address)), 'ton').toNumber();
    return {foo, bar, lp, ton};
}


async function dexBalances() {
    const foo = await FooVaultWallet.call({method: 'balance', params: {}}).then(n => {
        return new BigNumber(n).shiftedBy(-Constants.tokens.foo.decimals).toString();
    });
    const bar = await BarVaultWallet.call({method: 'balance', params: {}}).then(n => {
        return new BigNumber(n).shiftedBy(-Constants.tokens.bar.decimals).toString();
    });
    const lp = await FooBarLpVaultWallet.call({method: 'balance', params: {}}).then(n => {
        return new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    });
    return {foo, bar, lp};
}

function logBalances(header, dex, account, dexAccount, pair) {
    logger.log(`DEX balance ${header}: ${dex.foo} FOO, ${dex.bar} BAR, ${dex.lp} LP`);
    logger.log(`DexPair ${header}: ` +
        `${pair.foo} FOO, ${pair.bar} BAR, ` +
        `LP SUPPLY (PLAN): ${pair.lp_supply || "0"} LP, ` +
        `LP SUPPLY (ACTUAL): ${pair.lp_supply_actual || "0"} LP`);
    logger.log(`Account#2 balance ${header}: ` +
        `${account.foo !== undefined ? account.foo + ' FOO' : 'FOO (not deployed)'}, ` +
        `${account.bar !== undefined ? account.bar + ' BAR' : 'BAR (not deployed)'}, ` +
        `${account.lp !== undefined ? account.lp + ' LP' : 'LP (not deployed)'}`);
    logger.log(`DexAccount#2 balance ${header}: ` +
        `${dexAccount.foo} FOO, ${dexAccount.bar} BAR, ${dexAccount.lp} LP`);
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

describe('DexAccount interact with DexPair', async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        if (locklift.tracing) {
            locklift.tracing.allowCodes({compute: [100]});
        }

        DexRoot = await locklift.factory.getContract('DexRoot');
        DexPairFooBar = await locklift.factory.getContract(options.contract_name);
        FooRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        BarRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        FooVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        Account2 = await locklift.factory.getAccount('Wallet');
        DexAccount2 = await locklift.factory.getContract(options.account_contract_name);
        FooBarLpWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        let symbols = left_token.symbol + right_token.symbol;

        migration.load(DexRoot, 'DexRoot');
        migration.load(DexPairFooBar, 'DexPair' + symbols);
        migration.load(FooVaultWallet, left_token.symbol + 'VaultWallet');
        migration.load(BarVaultWallet, right_token.symbol + 'VaultWallet');
        migration.load(FooBarLpVaultWallet, 'FooBarLpVaultWallet');
        migration.load(FooRoot, left_token.symbol + 'Root');
        migration.load(BarRoot, right_token.symbol + 'Root');
        migration.load(FooBarLpRoot, symbols + 'LpRoot');
        migration.load(Account2, 'Account2');
        migration.load(DexAccount2, 'DexAccount2');

        Account2.afterRun = afterRun;


        if (migration.exists(`${left_token.symbol}${right_token.symbol}LpWallet2`)) {
            migration.load(FooBarLpWallet2, `${symbols}LpWallet2`);
            logger.log(`${symbols}LpWallet#2: ${FooBarLpWallet2.address}`);
        } else {
            const expected = await FooBarLpRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account2.address
                }
            });
            FooBarLpWallet2.setAddress(expected);
            migration.store(FooBarLpWallet2, `${symbols}LpWallet2`);
            logger.log(`${symbols}LpWallet#2: ${expected} (not deployed)`);
        }

        if (migration.exists(`${right_token.symbol}Wallet2`)) {
            migration.load(BarWallet2, `${right_token.symbol}Wallet2`);
            logger.log(`${right_token.symbol}Wallet#2: ${BarWallet2.address}`);
        } else {
            const expected = await BarRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account2.address
                }
            });
            BarWallet2.setAddress(expected);
            migration.store(BarWallet2, `${right_token.symbol}Wallet2`);
            logger.log(`${right_token.symbol}Wallet#2: ${expected} (not deployed)`);
        }

        if (migration.exists(`${left_token.symbol}Wallet2`)) {
            migration.load(FooWallet2, `${left_token.symbol}Wallet2`);
            logger.log(`${left_token.symbol}Wallet#2: ${FooWallet2.address}`);
        } else {
            const expected = await FooRoot.call({
                method: 'walletOf',
                params: {
                    walletOwner: Account2.address
                }
            });
            FooWallet2.setAddress(expected);
            migration.store(FooWallet2, `${left_token.symbol}Wallet2`);
            logger.log(`${left_token.symbol}Wallet#2: ${expected} (not deployed)`);
        }

        const pairRoots = await DexPairFooBar.call({method: 'getTokenRoots', params: {}});
        IS_FOO_LEFT = pairRoots.left === FooRoot.address;

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log(`DexPair${symbols}: ` + DexPairFooBar.address);
        logger.log(`${left_token.symbol}Root: ` + FooRoot.address);
        logger.log(`${right_token.symbol}Root: ` + BarRoot.address);
        logger.log(`${symbols}LpRoot: ` + FooBarLpRoot.address);
        logger.log('Account#2: ' + Account2.address);
        logger.log('DexAccount#2: ' + DexAccount2.address);

        await migration.balancesCheckpoint();
    });

    describe('Withdraw all', async function () {

        it(`Withdraw liquidity from ${left_token.symbol}/${right_token.symbol}`, async function () {
            logger.log('#################################################');
            logger.log(`# Withdraw liquidity from ${left_token.symbol}/${right_token.symbol}`);
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexPairInfoStart = await dexPairInfo();
            const account2Start = await account2balances();
            const dexStart = await dexBalances();

            logBalances('start', dexStart, account2Start, dexAccount2Start, dexPairInfoStart);



            const expected = await DexPairFooBar.call({
                method: 'expectedWithdrawLiquidity', params: {
                    lp_amount: new BigNumber(account2Start.lp).shiftedBy(Constants.LP_DECIMALS).toString()
                }
            });

            const payload = await DexPairFooBar.call({
                method: 'buildWithdrawLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0
                }
            });

            let expectedFoo;
            let expectedBar;

            if (IS_FOO_LEFT) {
                expectedFoo = new BigNumber(expected.expected_left_amount)
                    .shiftedBy(-Constants.tokens.foo.decimals).toString();
                expectedBar = new BigNumber(expected.expected_right_amount)
                    .shiftedBy(-Constants.tokens.bar.decimals).toString();
            } else {
                expectedFoo = new BigNumber(expected.expected_right_amount)
                    .shiftedBy(-Constants.tokens.foo.decimals).toString();
                expectedBar = new BigNumber(expected.expected_left_amount)
                    .shiftedBy(-Constants.tokens.bar.decimals).toString();
            }

            logger.log(`Expected FOO: ${expectedFoo}`);
            logger.log(`Expected BAR: ${expectedBar}`);

            let tx = await Account2.runTarget({
                contract: FooBarLpWallet2,
                method: 'transfer',
                params: {
                    amount: new BigNumber(account2Start.lp).shiftedBy(Constants.LP_DECIMALS).toString(),
                    recipient: DexPairFooBar.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account2.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal('2.3', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexPairInfoEnd = await dexPairInfo();
            const account2End = await account2balances();
            const dexEnd = await dexBalances();

            logBalances('end', dexEnd, account2End, dexAccount2End, dexPairInfoEnd);

            await logGas();

            const expectedDexFoo = new BigNumber(dexStart.foo)
                .minus(expectedFoo)
                .toString();
            const expectedDexBar = new BigNumber(dexStart.bar)
                .minus(expectedBar)
                .toString();
            const expectedAccountFoo = new BigNumber(account2Start.foo)
                .plus(expectedFoo)
                .toString();
            const expectedAccountBar = new BigNumber(account2Start.bar)
                .plus(expectedBar)
                .toString();
            const expectedAccountLp = '0';

            expect(dexPairInfoEnd.lp_supply_actual).to.equal(dexPairInfoEnd.lp_supply, 'Wrong LP supply');
            expect(expectedDexFoo).to.equal(dexEnd.foo.toString(), 'Wrong DEX FOO balance');
            expect(expectedDexBar).to.equal(dexEnd.bar.toString(), 'Wrong DEX BAR balance');
            expect(expectedAccountFoo).to.equal(account2End.foo.toString(), 'Wrong Account#3 FOO balance');
            expect(expectedAccountBar).to.equal(account2End.bar.toString(), 'Wrong Account#3 BAR balance');
            expect(expectedAccountLp).to.equal(account2End.lp.toString(), 'Wrong Account#3 LP balance');
        });

    });
});
