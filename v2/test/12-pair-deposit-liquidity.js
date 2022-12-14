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
    .option('-la, --left_amount <left_amount>', 'left amount')
    .option('-ra, --right_amount <right_amount>', 'right amount')
    .option('-ac, --auto_change <auto_change>', 'auto change')
    .option('-cn, --contract_name <contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name');

program.parse(process.argv);

const options = program.opts();

options.left_token_id = options.left_token_id || 'foo';
options.right_token_id = options.right_token_id || 'bar';
options.left_amount = options.left_amount || '1';
options.right_amount = options.right_amount || '2';
options.auto_change = options.auto_change === 'true';
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
        Account2 = await locklift.factory.getAccount('Wallet');
        DexAccount2 = await locklift.factory.getContract(options.account_contract_name);
        FooBarLpWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        let symbols = left_token.symbol + right_token.symbol;

        migration.load(DexRoot, 'DexRoot');
        migration.load(DexPairFooBar, 'DexPair' + symbols);
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

    describe('Deposit', async function () {

        it(`Deposit liquidity to ${left_token.symbol}/${right_token.symbol} (auto_change=${options.auto_change})`, async function () {
            logger.log('#################################################');
            logger.log(`# Add liquidity to ${left_token.symbol}/${right_token.symbol}`);
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`DexAccount#2 balance start: ` +
                `${dexAccount2Start.foo} ${left_token.symbol}, ${dexAccount2Start.bar} ${right_token.symbol}, ${dexAccount2Start.lp} LP, ${dexAccount2Start.walletLp} LP (wallet)`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} ${left_token.symbol}, ${dexPairInfoStart.bar} ${right_token.symbol}, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply || "0"} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual || "0"} LP`);

            const LEFT_AMOUNT = IS_FOO_LEFT ?
                new BigNumber(options.left_amount).shiftedBy(left_token.decimals).toString() :
                new BigNumber(options.right_amount).shiftedBy(right_token.decimals).toString();

            const RIGHT_AMOUNT = IS_FOO_LEFT ?
                new BigNumber(options.right_amount).shiftedBy(right_token.decimals).toString() :
                new BigNumber(options.left_amount).shiftedBy(left_token.decimals).toString();

            let LP_REWARD = await expectedDepositLiquidity(
                DexPairFooBar.address,
                options.contract_name,
                IS_FOO_LEFT ? [left_token, right_token] : [right_token, left_token],
                [LEFT_AMOUNT, RIGHT_AMOUNT],
                options.auto_change
            );

            const tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'depositLiquidity',
                params: {
                    call_id: getRandomNonce(),
                    left_root: IS_FOO_LEFT ? FooRoot.address : BarRoot.address,
                    left_amount: LEFT_AMOUNT,
                    right_root: IS_FOO_LEFT ? BarRoot.address : FooRoot.address,
                    right_amount: RIGHT_AMOUNT,
                    expected_lp_root: FooBarLpRoot.address,
                    auto_change: options.auto_change,
                    send_gas_to: Account2.address
                },
                value: locklift.utils.convertCrystal('1.1', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`DexAccount#2 balance end: ` +
                `${dexAccount2End.foo} ${left_token.symbol}, ${dexAccount2End.bar} ${right_token.symbol}, ${dexAccount2End.lp} LP, ${dexAccount2End.walletLp} LP (wallet)`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} ${left_token.symbol}, ${dexPairInfoEnd.bar} ${right_token.symbol}, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply || "0"} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual || "0"} LP`);

            await migration.logGas();

            let expectedAccount2Foo = new BigNumber(dexAccount2Start.foo).minus(options.left_amount).toString();
            let expectedAccount2Bar = new BigNumber(dexAccount2Start.bar).minus(options.right_amount).toString();

            let expectedDexAccount2Lp = new BigNumber(dexAccount2Start.lp).toString();
            let expectedAccount2Lp = new BigNumber(dexAccount2Start.walletLp).plus(LP_REWARD).toString();

            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo).plus(options.left_amount).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar).plus(options.right_amount).toString();
            const expectedPairLp = new BigNumber(dexPairInfoStart.lp_supply).plus(LP_REWARD).toString();

            expect(dexPairInfoEnd.lp_supply_actual).to.equal(dexPairInfoEnd.lp_supply, 'Wrong LP supply');
            expect(expectedAccount2Foo).to.equal(dexAccount2End.foo, 'Wrong DexAccount#2 FOO');
            expect(expectedAccount2Bar).to.equal(dexAccount2End.bar, 'Wrong DexAccount#2 BAR');
            expect(expectedDexAccount2Lp).to.equal(dexAccount2End.lp, 'Wrong DexAccount#2 LP');
            expect(expectedAccount2Lp).to.equal(dexAccount2End.walletLp, 'Wrong Account#2 LP');
            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo, 'Wrong DexPair FOO');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar, 'Wrong DexPair BAR');
            expect(expectedPairLp).to.equal(dexPairInfoEnd.lp_supply, 'Wrong DexPair LP supply');
        });

    });
});
