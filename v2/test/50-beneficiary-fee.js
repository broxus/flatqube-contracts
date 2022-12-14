const {expect} = require('chai');
const {Migration, afterRun, Constants, getRandomNonce, TOKEN_CONTRACTS_PATH, displayTx, logExpectedDeposit} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const logger = require('mocha-logger');
const { Command } = require('commander');
const program = new Command();

let tx;

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-pcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')
    .option('-fee, --fee <fee>', 'Fee params');

program.parse(process.argv);

const options = program.opts();

options.pair_contract_name = options.pair_contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';
options.fee = options.fee || '{}';
options.fee = JSON.parse(options.fee);

options.fee.denominator = options.fee.denominator || '1000000000';
options.fee.pool_numerator = options.fee.pool_numerator || '2000000';
options.fee.beneficiary_numerator = options.fee.beneficiary_numerator || '3000000';
options.fee.referrer_numerator = options.fee.referrer_numerator || '0';

let Account1;
let Account2;
let Account3;

let DexRoot;
let DexPairFooBar;
let FooRoot;
let BarRoot;
let FooBarLpRoot;
let DexAccount2;
let DexAccount3;
let FooBarLpWallet2;
let BarWallet2;
let FooWallet2;
let DexVault;
let FooVaultWallet;
let BarVaultWallet;
let FooBarLpVaultWallet;
let FooPairWallet;
let BarPairWallet;
let FooBarLpPairWallet;
let FooWallet3;
let BarWallet3;
let FooBarLpWallet3;

let IS_FOO_LEFT;

let keyPairs;

async function dexAccountBalances(account) {
    const foo = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: FooRoot.address
        }
    })).balance).shiftedBy(-Constants.tokens.foo.decimals).toString();
    const bar = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: BarRoot.address
        }
    })).balance).shiftedBy(-Constants.tokens.bar.decimals).toString();
    const lp = new BigNumber((await account.call({
        method: 'getWalletData', params: {
            token_root: FooBarLpRoot.address
        }
    })).balance).shiftedBy(-Constants.LP_DECIMALS).toString();

    let walletFoo = '0';
    await FooWallet2.call({method: 'balance', params: {}}).then(n => {
        walletFoo = new BigNumber(n).shiftedBy(-Constants.tokens.foo.decimals).toString();
    }).catch(e => {/*ignored*/});
    let walletBar = '0';
    await BarWallet2.call({method: 'balance', params: {}}).then(n => {
        walletBar = new BigNumber(n).shiftedBy(-Constants.tokens.bar.decimals).toString();
    }).catch(e => {/*ignored*/});
    let walletLp = '0';
    await FooBarLpWallet2.call({method: 'balance', params: {}}).then(n => {
        walletLp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/});

    return {foo, bar, lp, walletFoo, walletBar, walletLp};
}

async function dexPairInfo() {
    const balances = await DexPairFooBar.call({method: 'getBalances', params: {}});
    const total_supply = await FooBarLpRoot.call({method: 'totalSupply', params: {}});
    const [accumulated_left_fee, accumulated_right_fee] = await DexPairFooBar.call({method: 'getAccumulatedFees', params: {}});
    let foo, bar, fooFee, barFee;
    if (IS_FOO_LEFT) {
        foo = new BigNumber(balances.left_balance).shiftedBy(-Constants.tokens.foo.decimals).toString();
        bar = new BigNumber(balances.right_balance).shiftedBy(-Constants.tokens.bar.decimals).toString();
        fooFee = new BigNumber(accumulated_left_fee).shiftedBy(-Constants.tokens.foo.decimals).toString();
        barFee = new BigNumber(accumulated_right_fee).shiftedBy(-Constants.tokens.bar.decimals).toString();
    } else {
        foo = new BigNumber(balances.right_balance).shiftedBy(-Constants.tokens.foo.decimals).toString();
        bar = new BigNumber(balances.left_balance).shiftedBy(-Constants.tokens.bar.decimals).toString();
        fooFee = new BigNumber(accumulated_right_fee).shiftedBy(-Constants.tokens.foo.decimals).toString();
        barFee = new BigNumber(accumulated_left_fee).shiftedBy(-Constants.tokens.bar.decimals).toString();
    }

    return {
        foo: foo,
        bar: bar,
        lp_supply: new BigNumber(balances.lp_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        lp_supply_actual: new BigNumber(total_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        fooFee,
        barFee
    };
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

async function account2balances() {
    let foo;
    await FooWallet2.call({method: 'balance', params: {}}).then(n => {
        foo = new BigNumber(n).shiftedBy(-Constants.tokens.foo.decimals).toString();
    }).catch(e => {/*ignored*/});
    let bar;
    await BarWallet2.call({method: 'balance', params: {}}).then(n => {
        bar = new BigNumber(n).shiftedBy(-Constants.tokens.bar.decimals).toString();
    }).catch(e => {/*ignored*/});
    let lp;
    await FooBarLpWallet2.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/});
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account2.address)), 'ton').toNumber();
    return {foo, bar, lp, ton};
}

describe(`Test beneficiary fee ${options.pair_contract_name}`, async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        DexRoot = await locklift.factory.getContract('DexRoot');
        DexVault = await locklift.factory.getContract('DexVault');
        migration.load(DexRoot, 'DexRoot');
        migration.load(DexVault, 'DexVault');

        Account1 = await locklift.factory.getAccount('Wallet');
        Account2 = await locklift.factory.getAccount('Wallet');
        Account3 = await locklift.factory.getAccount('Wallet');
        migration.load(Account1, 'Account1');
        migration.load(Account2, 'Account2');
        migration.load(Account3, 'Account3');
        Account1.afterRun = afterRun;
        Account2.afterRun = afterRun;
        Account3.afterRun = afterRun;

        options.fee.beneficiary = Account3.address;

        DexPairFooBar = await locklift.factory.getContract(options.pair_contract_name);
        migration.load(DexPairFooBar, 'DexPairFooBar');

        FooRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        BarRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(FooRoot, 'FooRoot');
        migration.load(BarRoot, 'BarRoot');
        migration.load(FooBarLpRoot, 'FooBarLpRoot');

        options.fee.threshold = {};
        options.fee.threshold[FooRoot.address] = new BigNumber(2).shiftedBy(Constants.tokens.foo.decimals).toString();
        options.fee.threshold[BarRoot.address] = new BigNumber(2).shiftedBy(Constants.tokens.bar.decimals).toString();

        DexAccount2 = await locklift.factory.getContract(options.account_contract_name);
        DexAccount3 = await locklift.factory.getContract(options.account_contract_name);
        migration.load(DexAccount2, 'DexAccount2');
        migration.load(DexAccount3, 'DexAccount3');

        FooWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(FooWallet2, 'FooWallet2');
        migration.load(FooWallet3, 'FooWallet3');
        migration.load(BarWallet2, 'BarWallet2');
        migration.load(BarWallet3, 'BarWallet3');
        migration.load(FooBarLpWallet2, 'FooBarLpWallet2');
        migration.load(FooBarLpWallet3, 'FooBarLpWallet3');


        FooVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(FooVaultWallet, 'FooVaultWallet');
        migration.load(BarVaultWallet, 'BarVaultWallet');
        migration.load(FooBarLpVaultWallet, 'FooBarLpVaultWallet');

        FooPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        BarPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        FooBarLpPairWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(FooPairWallet, 'FooBarPair_FooWallet');
        migration.load(BarPairWallet, 'FooBarPair_BarWallet');
        migration.load(FooBarLpPairWallet, 'FooBarPair_LpWallet');

        const pairRoots = await DexPairFooBar.call({method: 'getTokenRoots', params: {}});
        IS_FOO_LEFT = pairRoots.left === FooRoot.address;

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log('DexVault: ' + DexVault.address);

        logger.log('Account#2: ' + Account2.address);
        logger.log('Account#3: ' + Account3.address);

        logger.log('DexPairFooBar: ' + DexPairFooBar.address);

        logger.log('FooRoot: ' + FooRoot.address);
        logger.log('BarRoot: ' + BarRoot.address);
        logger.log('FooBarLpRoot: ' + FooBarLpRoot.address);

        logger.log(`Vault wallets: 
            FOO: ${FooVaultWallet.address}
            BAR: ${BarVaultWallet.address}
            LP: ${FooBarLpVaultWallet.address}
        `);

        logger.log(`Pair wallets: 
            FOO: ${FooPairWallet.address}
            BAR: ${BarPairWallet.address}
            LP: ${FooBarLpPairWallet.address}
        `);

        logger.log('DexAccount#2: ' + DexAccount2.address);

        logger.log('FooWallet#2: ' + FooWallet2.address);
        logger.log('FooWallet#3: ' + FooWallet3.address);
        logger.log('BarWallet#2: ' + BarWallet2.address);
        logger.log('BarWallet#3: ' + BarWallet3.address);
        logger.log('FooBarLpWallet#2: ' + FooBarLpWallet2.address);
        logger.log('FooBarLpWallet#3: ' + FooBarLpWallet3.address);

        await migration.balancesCheckpoint();
    });

    describe('Configure fee params', async function () {
        it('Set fee params', async function () {
            logger.log('#################################################');
            logger.log(`# DexRoot.setPairFeeParams(${FooRoot.address}, ${BarRoot.address}, ${JSON.stringify(options.fee)}, ${Account1.address})`);

            const feeParamsStart = await DexPairFooBar.call({method: 'getFeeParams', params: {}});
            logger.log(`# Fee params start:`, JSON.stringify(feeParamsStart, null, 2));

            await Account1.runTarget({
                contract: DexRoot,
                method: 'setPairFeeParams',
                params: {
                    _roots: [FooRoot.address, BarRoot.address],
                    _params: options.fee,
                    _remainingGasTo: Account1.address
                },
                keyPair: keyPairs[0]
            });

            const feeParamsEnd = await DexPairFooBar.call({method: 'getFeeParams', params: {}});
            logger.log(`# Fee params end:`, JSON.stringify(feeParamsEnd, null, 2));

            await migration.logGas();

            expect(feeParamsEnd.beneficiary).to.equal(options.fee.beneficiary, 'WRONG fee.beneficiary');
            expect(feeParamsEnd.denominator.toFixed()).to.equal(options.fee.denominator, 'WRONG fee.denominator');
            expect(feeParamsEnd.pool_numerator.toFixed()).to.equal(options.fee.pool_numerator, 'WRONG fee.pool_numerator');
            expect(feeParamsEnd.beneficiary_numerator.toFixed()).to.equal(options.fee.beneficiary_numerator, 'WRONG fee.beneficiary_numerator');
            expect(feeParamsEnd.referrer_numerator.toFixed()).to.equal(options.fee.referrer_numerator, 'WRONG fee.referrer_numerator');
        });
    });

    describe('DexAccount deposit', async function () {
        it('Add FOO+BAR liquidity (auto_change=true)', async function () {
            logger.log('#################################################');
            logger.log('# Add FOO+BAR liquidity (auto_change=true)');
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`DexAccount#2 balance start: ` +
                `${dexAccount2Start.foo} FOO, ${dexAccount2Start.bar} BAR, ${dexAccount2Start.lp} LP`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR, ` +
                `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual} LP`);

            const FOO_DEPOSIT = 9000;
            const BAR_DEPOSIT = 1000;

            const LEFT_AMOUNT = IS_FOO_LEFT ?
                new BigNumber(FOO_DEPOSIT).shiftedBy(Constants.tokens.foo.decimals).toString() :
                new BigNumber(BAR_DEPOSIT).shiftedBy(Constants.tokens.bar.decimals).toString();

            const RIGHT_AMOUNT = IS_FOO_LEFT ?
                new BigNumber(BAR_DEPOSIT).shiftedBy(Constants.tokens.bar.decimals).toString() :
                new BigNumber(FOO_DEPOSIT).shiftedBy(Constants.tokens.foo.decimals).toString();

            const expected = await DexPairFooBar.call({
                method: 'expectedDepositLiquidity',
                params: {
                    left_amount: LEFT_AMOUNT,
                    right_amount: RIGHT_AMOUNT,
                    auto_change: true
                }
            });

            const LP_REWARD = new BigNumber(expected.step_1_lp_reward)
                .plus(expected.step_3_lp_reward).shiftedBy(-9).toString();

            logExpectedDeposit(
                expected,
                IS_FOO_LEFT ? [Constants.tokens.foo, Constants.tokens.bar] : [Constants.tokens.bar, Constants.tokens.foo]
            );

            tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'depositLiquidity',
                params: {
                    call_id: getRandomNonce(),
                    left_root: IS_FOO_LEFT ? FooRoot.address : BarRoot.address,
                    left_amount: LEFT_AMOUNT,
                    right_root: IS_FOO_LEFT ? BarRoot.address : FooRoot.address,
                    right_amount: RIGHT_AMOUNT,
                    expected_lp_root: FooBarLpRoot.address,
                    auto_change: true,
                    send_gas_to: Account2.address
                },
                value: locklift.utils.convertCrystal('2.6', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`DexAccount#2 balance end: ` +
                `${dexAccount2End.foo} FOO, ${dexAccount2End.bar} BAR, ${dexAccount2End.lp} LP, ${dexAccount2End.walletLp} LP (wallet)`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR, ${dexAccount3End.lp} LP, ${dexAccount3End.walletLp} LP (wallet)`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR, ` +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply || "0"} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual || "0"} LP`);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(expected.step_2_spent)
                .shiftedBy(-Constants.tokens.foo.decimals)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .div(options.fee.denominator)
                .dp(Constants.tokens.foo.decimals, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .dp(Constants.tokens.foo.decimals, BigNumber.ROUND_FLOOR);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            const expectedAccount2Foo = new BigNumber(dexAccount2Start.foo).minus(FOO_DEPOSIT).toString();
            const expectedAccount2Bar = new BigNumber(dexAccount2Start.bar).minus(BAR_DEPOSIT).toString();

            let expectedDexAccount2Lp = new BigNumber(dexAccount2Start.lp).toString();
            let expectedAccount2Lp = new BigNumber(dexAccount2Start.walletLp).plus(LP_REWARD).toString();

            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo).plus(FOO_DEPOSIT).minus(expectedBeneficiary).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar).plus(BAR_DEPOSIT).toString();
            const expectedPairLp = new BigNumber(dexPairInfoStart.lp_supply).plus(LP_REWARD).toString();

            let expectedDexAccount3Foo = expectedBeneficiary
                .plus(dexPairInfoStart.fooFee)
                .plus(dexAccount3Start.foo)
                .toString();

            expect(dexPairInfoEnd.lp_supply_actual).to.equal(dexPairInfoEnd.lp_supply, 'Wrong LP supply');
            expect(expectedAccount2Foo).to.equal(dexAccount2End.foo, 'Wrong DexAccount#2 FOO');
            expect(expectedAccount2Bar).to.equal(dexAccount2End.bar, 'Wrong DexAccount#2 BAR');
            expect(expectedDexAccount2Lp).to.equal(dexAccount2End.lp, 'Wrong DexAccount#2 LP');
            expect(expectedAccount2Lp).to.equal(dexAccount2End.walletLp, 'Wrong Account#2 LP');
            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo, 'Wrong DexPair FOO');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar, 'Wrong DexPair BAR');
            expect(expectedPairLp).to.equal(dexPairInfoEnd.lp_supply, 'Wrong DexPair LP supply');
            expect(expectedDexAccount3Foo).to.equal(new BigNumber(dexAccount3End.foo).plus(dexPairInfoEnd.fooFee).toString(),
        'Wrong beneficiary fee');
        });
    });

    describe('Direct deposit', async function () {
        it('Account#2 deposit BAR liquidity', async function () {
            logger.log('#################################################');
            logger.log('# Account#2 deposit BAR liquidity');
            const accountStart = await account2balances();
            const dexPairInfoStart = await dexPairInfo();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);

            logger.log(`Account#2 balance start: ` +
                `${accountStart.foo !== undefined ? accountStart.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountStart.bar !== undefined ? accountStart.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR, ` +
                `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual} LP`);

            const TOKENS_TO_DEPOSIT = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedDepositLiquidity', params: {
                    left_amount: IS_FOO_LEFT ? 0 : new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    right_amount: IS_FOO_LEFT ? new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.bar.decimals).toString() : 0,
                    auto_change: true
                }
            });

            logExpectedDeposit(
                expected,
                IS_FOO_LEFT ? [Constants.tokens.foo, Constants.tokens.bar] : [Constants.tokens.bar, Constants.tokens.foo]
            );

            const payload = await DexPairFooBar.call({
                method: 'buildDepositLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0
                }
            });

            tx = await Account2.runTarget({
                contract: BarWallet2,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.bar.decimals).toString(),
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

            const accountEnd = await account2balances();
            const dexPairInfoEnd = await dexPairInfo();
            const dexAccount3End = await dexAccountBalances(DexAccount3);

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.foo !== undefined ? accountEnd.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountEnd.bar !== undefined ? accountEnd.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR, ${dexAccount3End.lp} LP`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR, ` +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual} LP`);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(expected.step_2_spent)
                .shiftedBy(-Constants.tokens.bar.decimals)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .div(options.fee.denominator)
                .dp(Constants.tokens.bar.decimals, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .dp(Constants.tokens.bar.decimals, BigNumber.ROUND_FLOOR);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedDexAccount3Bar = expectedBeneficiary
                .plus(dexPairInfoStart.barFee)
                .plus(dexAccount3Start.bar)
                .toString();

            const expectedDexBar = new BigNumber(dexPairInfoStart.bar)
                .plus(TOKENS_TO_DEPOSIT)
                .minus(expectedBeneficiary)
                .toString();

            const expectedAccountBar = new BigNumber(accountStart.bar).minus(TOKENS_TO_DEPOSIT).toString();
            const expectedAccountLp = new BigNumber(accountStart.lp)
                .plus(new BigNumber(expected.step_3_lp_reward).shiftedBy(-Constants.LP_DECIMALS)).toString();

            expect(dexPairInfoEnd.lp_supply_actual).to.equal(dexPairInfoEnd.lp_supply, 'Wrong LP supply');
            expect(dexPairInfoEnd.bar.toString()).to.equal(expectedDexBar, 'Wrong DEX Pair BAR balance');
            expect(accountEnd.bar.toString()).to.equal(expectedAccountBar, 'Wrong Account#2 BAR balance');
            expect(accountEnd.lp.toString()).to.equal(expectedAccountLp, 'Wrong Account#2 LP balance');
            expect(new BigNumber(dexAccount3End.bar).plus(dexPairInfoEnd.barFee).toString()).to.equal(expectedDexAccount3Bar,
                'Wrong beneficiary fee');
        });
        it('Account#2 deposit FOO liquidity', async function () {
            logger.log('#################################################');
            logger.log('# Account#2 deposit FOO liquidity');
            const accountStart = await account2balances();
            const dexPairInfoStart = await dexPairInfo();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);

            logger.log(`Account#2 balance start: ` +
                `${accountStart.foo !== undefined ? accountStart.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountStart.bar !== undefined ? accountStart.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR, ` +
                `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual} LP`);

            const TOKENS_TO_DEPOSIT = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedDepositLiquidity', params: {
                    left_amount: IS_FOO_LEFT ? new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.foo.decimals).toString() : 0,
                    right_amount: IS_FOO_LEFT ? 0 : new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.foo.decimals).toString(),
                    auto_change: true
                }
            });

            logExpectedDeposit(
                expected,
                IS_FOO_LEFT ? [Constants.tokens.foo, Constants.tokens.bar] : [Constants.tokens.bar, Constants.tokens.foo]
            );

            const payload = await DexPairFooBar.call({
                method: 'buildDepositLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0
                }
            });

            tx = await Account2.runTarget({
                contract: FooWallet2,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(Constants.tokens.foo.decimals).toString(),
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

            const accountEnd = await account2balances();
            const dexPairInfoEnd = await dexPairInfo();
            const dexAccount3End = await dexAccountBalances(DexAccount3);

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.foo !== undefined ? accountEnd.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountEnd.bar !== undefined ? accountEnd.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR, ${dexAccount3End.lp} LP`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR, ` +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual} LP`);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(expected.step_2_spent)
                .shiftedBy(-Constants.tokens.foo.decimals)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .div(options.fee.denominator)
                .dp(Constants.tokens.foo.decimals, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator))
                .dp(Constants.tokens.foo.decimals, BigNumber.ROUND_FLOOR);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedDexAccount3Foo = expectedBeneficiary
                .plus(dexPairInfoStart.fooFee)
                .plus(dexAccount3Start.foo)
                .toString();

            const expectedDexFoo = new BigNumber(dexPairInfoStart.foo)
                .plus(TOKENS_TO_DEPOSIT)
                .minus(expectedBeneficiary)
                .toString();

            const expectedAccountFoo = new BigNumber(accountStart.foo).minus(TOKENS_TO_DEPOSIT).toString();
            const expectedAccountLp = new BigNumber(accountStart.lp)
                .plus(new BigNumber(expected.step_3_lp_reward).shiftedBy(-Constants.LP_DECIMALS)).toString();

            expect(dexPairInfoEnd.lp_supply_actual).to.equal(dexPairInfoEnd.lp_supply, 'Wrong LP supply');
            expect(expectedDexFoo).to.equal(dexPairInfoEnd.foo.toString(), 'Wrong DEX Pair FOO balance');
            expect(expectedAccountFoo).to.equal(accountEnd.foo.toString(), 'Wrong Account#2 FOO balance');
            expect(expectedAccountLp).to.equal(accountEnd.lp.toString(), 'Wrong Account#2 LP balance');
            expect(expectedDexAccount3Foo).to.equal(new BigNumber(dexAccount3End.foo).plus(dexPairInfoEnd.fooFee).toString(),
                'Wrong beneficiary fee');
        });
    });

    describe('DexAccount exchanges', async function () {
        it('DexAccount#2 exchange FOO to BAR', async function () {
            logger.log('#################################################');
            logger.log('# DexAccount#2 exchange FOO to BAR');
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`DexAccount#2 balance start: ${dexAccount2Start.foo} FOO, ${dexAccount2Start.bar} BAR`);
            logger.log(`DexAccount#3 balance start: ${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR`);
            logger.log(`DexPair start: ${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR\n`  +
                       `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE`);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.foo.decimals).toString(),
                    spent_token_root: FooRoot.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} FOO`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.foo.decimals).toString()} FOO`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);

            tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'exchange',
                params: {
                    call_id: getRandomNonce(),
                    spent_amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.foo.decimals).toString(),
                    spent_token_root: FooRoot.address,
                    receive_token_root: BarRoot.address,
                    expected_amount: expected.expected_amount,
                    send_gas_to: Account2.address
                },
                value: locklift.utils.convertCrystal('1.1', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`DexAccount#2 balance end: ${dexAccount2End.foo} FOO, ${dexAccount2End.bar} BAR`);
            logger.log(`DexAccount#3 balance end: ${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR`);
            logger.log(`DexPair end: ${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR\n`  +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE`);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(TOKENS_TO_EXCHANGE)
                .shiftedBy(Constants.tokens.foo.decimals)
                .times(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-Constants.tokens.foo.decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo).plus(TOKENS_TO_EXCHANGE).minus(expectedBeneficiary).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar)
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.bar.decimals)).toString();
            const expectedDexAccountFoo = new BigNumber(dexAccount2Start.foo).minus(TOKENS_TO_EXCHANGE).toString();
            const expectedDexAccountBar = new BigNumber(dexAccount2Start.bar)
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.bar.decimals)).toString();

            let expectedDexAccount3Foo = expectedBeneficiary
                .plus(dexPairInfoStart.fooFee)
                .plus(dexAccount3Start.foo)
                .toString();

            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo.toString(), 'Wrong DEX Pair FOO balance');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar.toString(), 'Wrong DEX Pair BAR balance');
            expect(expectedDexAccountFoo).to.equal(dexAccount2End.foo.toString(), 'Wrong DexAccount#2 FOO balance');
            expect(expectedDexAccountBar).to.equal(dexAccount2End.bar.toString(), 'Wrong DexAccount#2 BAR balance');
            expect(expectedDexAccount3Foo).to.equal(new BigNumber(dexAccount3End.foo).plus(dexPairInfoEnd.fooFee).toString(),
                'Wrong beneficiary fee');
        });
        it('DexAccount#2 exchange BAR to FOO', async function () {
            logger.log('#################################################');
            logger.log('# DexAccount#2 exchange BAR to FOO');
            const dexAccount2Start = await dexAccountBalances(DexAccount2);
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`DexAccount#2 balance start: ${dexAccount2Start.foo} FOO, ${dexAccount2Start.bar} BAR`);
            logger.log(`DexAccount#3 balance start: ${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR`);
            logger.log(`DexPair start: ${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR\n`  +
                       `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE`);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: BarRoot.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} BAR`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals).toString()} FOO`);

            tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'exchange',
                params: {
                    call_id: getRandomNonce(),
                    spent_amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: BarRoot.address,
                    receive_token_root: FooRoot.address,
                    expected_amount: 0,
                    send_gas_to: Account2.address
                },
                value: locklift.utils.convertCrystal('1.1', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            let expectedBeneficiary = new BigNumber(TOKENS_TO_EXCHANGE)
                .shiftedBy(Constants.tokens.bar.decimals)
                .times(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-Constants.tokens.bar.decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`DexAccount#2 balance end: ${dexAccount2End.foo} FOO, ${dexAccount2End.bar} BAR`);
            logger.log(`DexAccount#3 balance end: ${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR`);
            logger.log(`DexPair end: ${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR\n`  +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE`);

            await migration.logGas();

            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo)
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar).plus(TOKENS_TO_EXCHANGE).minus(expectedBeneficiary).toString();
            const expectedDexAccountFoo = new BigNumber(dexAccount2Start.foo)
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedDexAccountBar = new BigNumber(dexAccount2Start.bar).minus(TOKENS_TO_EXCHANGE).toString();

            let expectedDexAccount3Bar = expectedBeneficiary
                .plus(dexPairInfoStart.barFee)
                .plus(dexAccount3Start.bar)
                .toString();

            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo.toString(), 'Wrong DEX Pair FOO balance');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar.toString(), 'Wrong DEX Pair BAR balance');
            expect(expectedDexAccountFoo).to.equal(dexAccount2End.foo.toString(), 'Wrong DexAccount#2 FOO balance');
            expect(expectedDexAccountBar).to.equal(dexAccount2End.bar.toString(), 'Wrong DexAccount#2 BAR balance');
            expect(expectedDexAccount3Bar).to.equal(new BigNumber(dexAccount3End.bar).plus(dexPairInfoEnd.barFee).toString(),
                'Wrong beneficiary fee');
        });
    });

    describe('Direct exchanges', async function () {
        it('Account#2 exchange BAR to FOO', async function () {
            logger.log('#################################################');
            logger.log('# Account#2 exchange BAR to FOO');
            const dexStart = await dexBalances();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const accountStart = await account2balances();
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`Account#2 balance start: ` +
                `${accountStart.foo !== undefined ? accountStart.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountStart.bar !== undefined ? accountStart.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR, ` +
                `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.foo} FOO, ${dexStart.bar} BAR`);

            const TOKENS_TO_EXCHANGE = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedExchange', params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    spent_token_root: BarRoot.address
                }
            });

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE.toString()} BAR`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.bar.decimals).toString()} BAR`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals).toString()} FOO`);

            const payload = await DexPairFooBar.call({
                method: 'buildExchangePayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amount: expected.expected_amount
                }
            });

            tx = await Account2.runTarget({
                contract: BarWallet2,
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(Constants.tokens.bar.decimals).toString(),
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

            const dexEnd = await dexBalances();
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const accountEnd = await account2balances();
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.foo !== undefined ? accountEnd.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountEnd.bar !== undefined ? accountEnd.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR, ${dexAccount3End.lp} LP`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR, ` +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual} LP`);
            logger.log(`DEXVault end: ${dexEnd.foo} FOO, ${dexEnd.bar} BAR`);


            await migration.logGas();

            let expectedBeneficiary = new BigNumber(TOKENS_TO_EXCHANGE)
                .shiftedBy(Constants.tokens.bar.decimals)
                .times(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-Constants.tokens.bar.decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedDexAccount3Bar = expectedBeneficiary
                .plus(dexPairInfoStart.barFee)
                .plus(dexAccount3Start.bar)
                .toString();
            const expectedDexFoo = new BigNumber(dexStart.foo)
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedDexBar = new BigNumber(dexStart.bar).plus(TOKENS_TO_EXCHANGE).toString();
            const expectedAccountFoo = new BigNumber(accountStart.foo)
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedAccountBar = new BigNumber(accountStart.bar).minus(TOKENS_TO_EXCHANGE).toString();
            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo)
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar).plus(TOKENS_TO_EXCHANGE).minus(expectedBeneficiary).toString();


            expect(expectedDexFoo).to.equal(dexEnd.foo.toString(), 'Wrong DEX FOO balance');
            expect(expectedDexBar).to.equal(dexEnd.bar.toString(), 'Wrong DEX BAR balance');
            expect(expectedAccountFoo).to.equal(accountEnd.foo.toString(), 'Wrong Account#2 FOO balance');
            expect(expectedAccountBar).to.equal(accountEnd.bar.toString(), 'Wrong Account#2 BAR balance');
            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo.toString(), 'Wrong DEXPair FOO balance');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar.toString(), 'Wrong DEXPair BAR balance');
            expect(expectedDexAccount3Bar).to.equal(new BigNumber(dexAccount3End.bar).plus(dexPairInfoEnd.barFee).toString(),
                'Wrong beneficiary fee');
        });

        it('Account#2 exchange FOO to BAR (expectedSpendAmount)', async function () {
            logger.log('#################################################');
            logger.log('# Account#2 exchange FOO to BAR');
            const dexStart = await dexBalances();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const accountStart = await account2balances();
            const dexPairInfoStart = await dexPairInfo();

            logger.log(`Account#2 balance start: ` +
                `${accountStart.foo !== undefined ? accountStart.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountStart.bar !== undefined ? accountStart.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPair start: ` +
                `${dexPairInfoStart.foo} FOO, ${dexPairInfoStart.bar} BAR, ` +
                `${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoStart.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.foo} FOO, ${dexStart.bar} BAR`);

            const TOKENS_TO_RECEIVE = 100;

            const expected = await DexPairFooBar.call({
                method: 'expectedSpendAmount', params: {
                    receive_amount: new BigNumber(TOKENS_TO_RECEIVE).shiftedBy(Constants.tokens.bar.decimals).toString(),
                    receive_token_root: BarRoot.address
                }
            });

            logger.log(`Expected spend amount: ${new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals).toString()} FOO`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-Constants.tokens.foo.decimals).toString()} FOO`);
            logger.log(`Expected receive amount: ${TOKENS_TO_RECEIVE} BAR`);

            const payload = await DexPairFooBar.call({
                method: 'buildExchangePayload', params: {
                    id: 0,
                    deploy_wallet_grams: 0,
                    expected_amount: 0
                }
            });

            tx = await Account2.runTarget({
                contract: FooWallet2,
                method: 'transfer',
                params: {
                    amount: expected.expected_amount,
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

            const dexEnd = await dexBalances();
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const accountEnd = await account2balances();
            const dexPairInfoEnd = await dexPairInfo();

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.foo !== undefined ? accountEnd.foo + ' FOO' : 'FOO (not deployed)'}, ` +
                `${accountEnd.bar !== undefined ? accountEnd.bar + ' BAR' : 'BAR (not deployed)'}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR, ${dexAccount3End.lp} LP`);
            logger.log(`DexPair end: ` +
                `${dexPairInfoEnd.foo} FOO, ${dexPairInfoEnd.bar} BAR, ` +
                `${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE, ` +
                `LP SUPPLY (PLAN): ${dexPairInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPairInfoEnd.lp_supply_actual} LP`);
            logger.log(`DEXVault end: ${dexEnd.foo} FOO, ${dexEnd.bar} BAR`);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(expected.expected_amount)
                .times(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(options.fee.pool_numerator + options.fee.beneficiary_numerator)
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-Constants.tokens.foo.decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedDexAccount3Foo = expectedBeneficiary
                .plus(dexPairInfoStart.fooFee)
                .plus(dexAccount3Start.foo)
                .toString();

            const expectedDexBar = new BigNumber(dexStart.bar)
                .minus(TOKENS_TO_RECEIVE).toString();
            const expectedDexFoo = new BigNumber(dexStart.foo)
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedAccountBar = new BigNumber(accountStart.bar)
                .plus(TOKENS_TO_RECEIVE).toString();
            const expectedAccountFoo = new BigNumber(accountStart.foo)
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals)).toString();
            const expectedPairFoo = new BigNumber(dexPairInfoStart.foo)
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-Constants.tokens.foo.decimals))
                .minus(expectedBeneficiary).toString();
            const expectedPairBar = new BigNumber(dexPairInfoStart.bar).minus(TOKENS_TO_RECEIVE).toString();

            expect(expectedAccountFoo).to.equal(accountEnd.foo.toString(), 'Wrong Account#2 FOO balance');
            expect(expectedAccountBar).to.equal(accountEnd.bar.toString(), 'Wrong Account#2 BAR balance');
            expect(expectedPairFoo).to.equal(dexPairInfoEnd.foo.toString(), 'Wrong DEXPair FOO balance');
            expect(expectedPairBar).to.equal(dexPairInfoEnd.bar.toString(), 'Wrong DEXPair BAR balance');
            expect(expectedDexAccount3Foo).to.equal(new BigNumber(dexAccount3End.foo).plus(dexPairInfoEnd.fooFee).toString(),
                'Wrong beneficiary fee');
            expect(expectedDexFoo).to.equal(dexEnd.foo.toString(), 'Wrong DEX FOO balance');
            expect(expectedDexBar).to.equal(dexEnd.bar.toString(), 'Wrong DEX BAR balance');
        });
    });

    describe('Withdraw beneficiary fee', async function () {
        it('Account#3 withdraw fee', async function () {
            logger.log('#################################################');
            logger.log('# DexPair.withdrawBeneficiaryFee');
            const dexPairInfoStart = await dexPairInfo();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);

            logger.log(`DexAccount#3 balance end: ${dexAccount3Start.foo} FOO, ${dexAccount3Start.bar} BAR`);
            logger.log(`${dexPairInfoStart.fooFee} FOO FEE, ${dexPairInfoStart.barFee} BAR FEE`);

            tx = await Account3.runTarget({
                contract: DexPairFooBar,
                method: 'withdrawBeneficiaryFee',
                params: {
                    send_gas_to: Account3.address
                },
                value: locklift.utils.convertCrystal('1', 'nano'),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexPairInfoEnd = await dexPairInfo();
            const dexAccount3End = await dexAccountBalances(DexAccount3);

            logger.log(`DexAccount#3 balance end: ${dexAccount3End.foo} FOO, ${dexAccount3End.bar} BAR`);
            logger.log(`${dexPairInfoEnd.fooFee} FOO FEE, ${dexPairInfoEnd.barFee} BAR FEE`);

            await migration.logGas();

            expect(dexPairInfoEnd.fooFee).to.equal('0','Wrong FOO pair fee');
            expect(dexPairInfoEnd.barFee).to.equal('0','Wrong BAR pair fee');
            expect(new BigNumber(dexAccount3Start.foo).plus(dexPairInfoStart.fooFee).toString())
                .to.equal(
                new BigNumber(dexAccount3End.foo).plus(dexPairInfoEnd.fooFee).toString(),
                'Wrong FOO beneficiary fee'
            );
            expect(new BigNumber(dexAccount3Start.bar).plus(dexPairInfoStart.barFee).toString())
                .to.equal(
                    new BigNumber(dexAccount3End.bar).plus(dexPairInfoEnd.barFee).toString(),
                'Wrong BAR beneficiary fee'
                );
        });
    });
});
