const {expect} = require('chai');
const {Migration, afterRun, Constants, getRandomNonce, TOKEN_CONTRACTS_PATH, displayTx, logExpectedDeposit, logExpectedDepositV2} = require(process.cwd() + '/scripts/utils');
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const logger = require('mocha-logger');
const { Command } = require('commander');
const program = new Command();

let tx;

const migration = new Migration();

program
    .allowUnknownOption()
    .option('-pcn, --pool_contract_name <pool_contract_name>', 'DexPool contract name')
    .option('-acn, --account_contract_name <account_contract_name>', 'DexAccount contract name')
    .option('-r, --roots <roots>', 'Pool tokens list')
    .option('-fee, --fee <fee>', 'Fee params');

program.parse(process.argv);

const options = program.opts();

options.roots = options.roots ? JSON.parse(options.roots) : ['foo', 'bar'];
options.pool_contract_name = options.pool_contract_name || 'DexPair';
options.account_contract_name = options.account_contract_name || 'DexAccount';
options.fee = options.fee || '{}';
options.fee = JSON.parse(options.fee);

options.fee.denominator = options.fee.denominator || '1000000000';
options.fee.pool_numerator = options.fee.pool_numerator || '2000000';
options.fee.beneficiary_numerator = options.fee.beneficiary_numerator || '3000000';
options.fee.referrer_numerator = options.fee.referrer_numerator || '1000000';

let Account1;
let Account2;
let Account3;
let Account4;

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
let DexAccount2;
let poolLpWallet2;
let tokenWallets2;
let DexAccount3;
let poolLpWallet3;
let tokenWallets3;
let tokenWallets4;
let DexVault;
let tokenVaultWallets;
let poolLpVaultWallet;
let poolTokenWallets;
let poolLpPoolWallet;

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
    const balances_data = await DexPool.call({method: 'getBalances', params: {}});
    let balances = [];
    if (options.pool_contract_name === 'DexStablePool') {
        balances = balances_data.balances;
    } else {
        balances = [balances_data.left_balance, balances_data.right_balance];
    }
    const total_supply = await poolLpRoot.call({method: 'totalSupply', params: {}});
    const accumulated_fees = await DexPool.call({method: 'getAccumulatedFees', params: {}});
    const tokenBalances = [];
    const tokenFee = [];
    for (let i = 0; i < N_COINS; i++) {
        tokenBalances.push(new BigNumber(balances[i]).shiftedBy(-tokens[i].decimals).toString());
        tokenFee.push(new BigNumber(accumulated_fees[i]).shiftedBy(-tokens[i].decimals).toString());
    }

    return {
        token_balances: tokenBalances,
        lp_supply: new BigNumber(balances_data.lp_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        lp_supply_actual: new BigNumber(total_supply).shiftedBy(-Constants.LP_DECIMALS).toString(),
        token_fees: tokenFee
    };
}

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

async function account2balances() {
    const token_balances = [];
    for (let i = 0; i < N_COINS; i++) {
        await tokenWallets2[i].call({method: 'balance', params: {}}).then(n => {
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
    await poolLpWallet2.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account2.address)), 'ton').toNumber();
    return {token_balances, lp, ton};
}

async function account4balances() {
    const token_balances = [];
    for (let i = 0; i < N_COINS; i++) {
        await tokenWallets4[i].call({method: 'balance', params: {}}).then(n => {
            token_balances.push(
                new BigNumber(n).shiftedBy(-tokens[i].decimals).toString()
            );
        }).catch(e => {
            token_balances.push(
                undefined
            );
        });
    }
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(Account4.address)), 'ton').toNumber();
    return {token_balances, ton};
}

describe(`Test beneficiary fee ${options.pool_contract_name}`, async function () {
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
        Account4 = await locklift.factory.getAccount('Wallet');
        migration.load(Account1, 'Account1');
        migration.load(Account2, 'Account2');
        migration.load(Account3, 'Account3');
        migration.load(Account4, 'Account4');
        Account1.afterRun = afterRun;
        Account2.afterRun = afterRun;
        Account3.afterRun = afterRun;
        Account4.afterRun = afterRun;

        options.fee.beneficiary = Account3.address;

        DexPool = await locklift.factory.getContract(options.pool_contract_name);
        if (options.roots.length === 2) {
            migration.load(DexPool, 'DexPair' + poolName);
        } else {
            migration.load(DexPool, 'DexPool' + poolName);
        }

        tokenRoots = [];
        let tempTokenRoots = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
            tempTokenRoots.push(await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH));
        }
        poolLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        let roots = [];
        if (options.roots.length === 2) {
            let data = await DexPool.call({method: 'getTokenRoots', params: {}});
            roots = [data.left, data.right];
        } else {
            roots = (await DexPool.call({method: 'getTokenRoots', params: {}})).roots;
        }
        let tokenData = {}; // address to symbol
        for (let i = 0; i < N_COINS; i++) {
            let symbol = Constants.tokens[options.roots[i]].symbol;
            migration.load(tempTokenRoots[i], symbol + 'Root');
            tokenData[tempTokenRoots[i].address] = options.roots[i];
        }
        migration.load(poolLpRoot, poolName + 'LpRoot');

        let tokenSymbols = [];
        for (let root of roots) {
            tokenSymbols.push(tokenData[root]);
        }

        for (let i = 0; i < N_COINS; i++) {
            let token = Constants.tokens[tokenSymbols[i]];
            tokens.push(token);
            migration.load(tokenRoots[i], token.symbol + 'Root');
        }

        options.fee.threshold = {};
        for (let i = 0; i < N_COINS; i++) {
            options.fee.threshold[tokenRoots[i].address] = new BigNumber(2).shiftedBy(tokens[i].decimals).toString();
        }

        options.fee.referrer_threshold = {};
        // for (let i = 0; i < N_COINS; i++) {
        //     options.fee.referrer_threshold[tokenRoots[i].address] = new BigNumber(1).shiftedBy(tokens[i].decimals).toString();
        // }

        DexAccount2 = await locklift.factory.getContract(options.account_contract_name);
        DexAccount3 = await locklift.factory.getContract(options.account_contract_name);
        migration.load(DexAccount2, 'DexAccount2');
        migration.load(DexAccount3, 'DexAccount3');

        tokenWallets2 = [];
        tokenWallets3 = [];
        tokenWallets4 = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenWallets2.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
            tokenWallets3.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
            tokenWallets4.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));

            tokenWallets4[i].setAddress(await tokenRoots[i].call({
                method: 'walletOf',
                params: {
                    walletOwner: Account4.address
                }
            }));
        }
        poolLpWallet2 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        poolLpWallet3 = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        for (let i = 0; i < N_COINS; i++) {
            migration.load(tokenWallets2[i], tokens[i].symbol + 'Wallet2');
            migration.load(tokenWallets3[i], tokens[i].symbol + 'Wallet3');
        }
        migration.load(poolLpWallet2, poolName + 'LpWallet2');
        // migration.load(poolLpWallet3, poolName + 'LpWallet3');

        tokenVaultWallets = [];
        for (let i = 0; i < N_COINS; i++) {
            tokenVaultWallets.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
            migration.load(tokenVaultWallets[i], tokens[i].symbol + 'VaultWallet');
        }
        poolLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(poolLpVaultWallet, poolName + 'LpVaultWallet');

        poolTokenWallets = [];
        for (let i = 0; i < N_COINS; i++) {
            poolTokenWallets.push(await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH));
            migration.load(poolTokenWallets[i], poolName + (options.roots.length === 2 ? 'Pair_' : 'Pool_') + tokens[i].symbol + 'Wallet');
        }
        poolLpPoolWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        migration.load(poolLpPoolWallet, poolName + (options.roots.length === 2 ? 'Pair_' : 'Pool_') + 'LpWallet');

        logger.log('DexRoot: ' + DexRoot.address);
        logger.log('DexVault: ' + DexVault.address);

        logger.log('Account#2: ' + Account2.address);
        logger.log('Account#3: ' + Account3.address);
        logger.log('Account#4: ' + Account4.address);

        logger.log('DexPool: ' + DexPool.address);

        for (let i = 0; i < N_COINS; i++) {
            logger.log(tokens[i].symbol + 'Root: ' + tokenRoots[i].address);
        }
        logger.log(poolName + 'LpRoot: ' + poolLpRoot.address);

        let logs = `Vault wallets: \n`
        for (let i = 0; i < N_COINS; i++) {
            logs += `${tokens[i].symbol}: ${tokenVaultWallets[i].address}\n`;
        }
        logs += `LP: ${poolLpVaultWallet.address}`;
        logger.log(logs);

        logs = `Pair wallets: \n`
        for (let i = 0; i < N_COINS; i++) {
            logs += `${tokens[i].symbol}: ${poolTokenWallets[i].address}\n`;
        }
        logs += `LP: ${poolLpPoolWallet.address}`;
        logger.log(logs);

        logger.log('DexAccount#2: ' + DexAccount2.address);
        logger.log('DexAccount#3: ' + DexAccount3.address);

        for (let i = 0; i < N_COINS; i++) {
            logger.log(tokens[i].symbol + 'Wallet#2: ' + tokenWallets2[i].address);
            logger.log(tokens[i].symbol + 'Wallet#3: ' + tokenWallets3[i].address);
        }
        logger.log(poolName + 'LpWallet#2: ' + poolLpWallet2.address);
        logger.log(poolName + 'LpWallet#3: ' + poolLpWallet3.address);

        await migration.balancesCheckpoint();
    });

    before('Set referral program params', async function () {
        let projectId = 22222;
        let projectAddress = locklift.utils.zeroAddress;
        let refSystemAddress = Account4.address;

        logger.log(`Set referral program params:\n      -project_id: ${projectId}\n      -project_address: ${projectAddress}\n      -ref_system_address: ${refSystemAddress}`);
        const tx = await Account1.runTarget({
            contract: DexVault,
            method: 'updateReferralProgramParams',
            params: {
                project_id: projectId,
                project_address: projectAddress,
                ref_system_address: refSystemAddress
            },
            value: locklift.utils.convertCrystal(1, 'nano'),
            keyPair: keyPairs[0]
        });
        displayTx(tx);
    });

    describe('Configure fee params', async function () {
        it('Set fee params', async function () {
            logger.log('#################################################');
            logger.log(`# DexRoot.setPairFeeParams(${JSON.stringify(options.fee)}, ${Account1.address})`);

            const feeParamsStart = await DexPool.call({method: 'getFeeParams', params: {}});
            logger.log(`# Fee params start:`, JSON.stringify(feeParamsStart, null, 2));

            const roots = Object.values(tokenRoots).map((elem) => elem.address);
            await Account1.runTarget({
                contract: DexRoot,
                method: 'setPairFeeParams',
                params: {
                    _roots: roots,
                    _params: options.fee,
                    _remainingGasTo: Account1.address
                },
                keyPair: keyPairs[0]
            });

            const feeParamsEnd = await DexPool.call({method: 'getFeeParams', params: {}});
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
            const dexPoolInfoStart = await dexPoolInfo();
            const referrerStart = await account4balances();

            let logs = `DexAccount#2 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount2Start.accountBalances[i]} ${tokens[i].symbol}, `;
            }
            logs += `${dexAccount2Start.lp} LP`;
            logger.log(logs);

            logger.log(`Account#2 LP start: ${dexAccount2Start.walletLp}`)

            logs = `DexAccount#3 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount3Start.accountBalances[i]} ${tokens[i].symbol}, `;
            }
            logs += `${dexAccount3Start.lp} LP`;
            logger.log(logs);

            logs = `DexPool start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexPoolInfoStart.token_balances[i]} ${tokens[i].symbol}, `;
                logs += `${dexPoolInfoStart.token_fees[i]} ${tokens[i].symbol} FEE, `;
            }
            logs += `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`;
            logger.log(logs);

            logs = `Account#4 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            const deposits = new Array(N_COINS);
            const amounts = new Array(N_COINS);
            const operations = [];
            for (let i = 0; i < N_COINS; i++) {
                deposits[i] = i % 2 ? 1000 : 9000;
                amounts[i] = new BigNumber(deposits[i]).shiftedBy(tokens[i].decimals).toString();
                operations.push({
                    amount: amounts[i],
                    root: tokenRoots[i].address
                });
            }

            let LP_REWARD;
            let expected;
            if (options.pool_contract_name === "DexStablePair" || options.pool_contract_name === "DexStablePool") {
                expected = await DexPool.call({
                    method: 'expectedDepositLiquidityV2',
                    params: {
                        amounts
                    }
                });

                LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

                logExpectedDepositV2(expected, tokens);
            } else {
                expected = await DexPool.call({
                    method: 'expectedDepositLiquidity',
                    params: {
                        left_amount: amounts[0],
                        right_amount: amounts[1],
                        auto_change: true
                    }
                });

                LP_REWARD = new BigNumber(expected.step_1_lp_reward)
                    .plus(expected.step_3_lp_reward).shiftedBy(-9).toString();

                logExpectedDeposit(expected, tokens);
            }

            const tx = await Account2.runTarget({
                contract: DexAccount2,
                method: 'depositLiquidityV2',
                params: {
                    _callId: getRandomNonce(),
                    _operations: operations,
                    _expected: {
                        amount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS).toString(),
                        root: poolLpRoot.address},
                    _autoChange: true,
                    _remainingGasTo: Account2.address,
                    _referrer: Account2.address
                },
                value: locklift.utils.convertCrystal('5', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexAccount2End = await dexAccountBalances(DexAccount2);
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const dexPoolInfoEnd = await dexPoolInfo();
            const referrerEnd = await account4balances();

            logs = `DexAccount#2 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount2End.accountBalances[i]} ${tokens[i].symbol}, `;
            }
            logs += `${dexAccount2End.lp} LP`;
            logger.log(logs);

            logger.log(`Account#2 LP end: ${dexAccount2End.walletLp}`)

            logs = `DexAccount#3 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount3End.accountBalances[i]} ${tokens[i].symbol}, `;
            }
            logs += `${dexAccount3End.lp} LP`;
            logger.log(logs);

            logs = `DexPool end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexPoolInfoEnd.token_balances[i]} ${tokens[i].symbol}, `;
                logs += `${dexPoolInfoEnd.token_fees[i]} ${tokens[i].symbol} FEE, `;
            }
            logs += `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`;
            logger.log(logs);

            logs = `Account#4 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            await migration.logGas();

            let expectedAccount2TokenBalances = [];
            for (let i = 0; i < N_COINS; i++) {
                expectedAccount2TokenBalances.push(new BigNumber(dexAccount2Start.accountBalances[i]).minus(deposits[i]).toString());
            }
            let expectedDexAccount2Lp = new BigNumber(dexAccount2Start.lp).toString();
            let expectedAccount2Lp = new BigNumber(dexAccount2Start.walletLp).plus(LP_REWARD).toString();

            let expectedPoolTokenBalances = [];
            let expectedPoolLp = new BigNumber(dexPoolInfoStart.lp_supply).plus(LP_REWARD).toString();
            let expectedDexAccount3TokenBalances = [];
            let expectedReferrerBalance = [];
            if (options.pool_contract_name === 'DexStablePool' || options.pool_contract_name === 'DexStablePair') {
                let fee_numerator = new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator).multipliedBy(options.roots.length).dividedBy(4 * (options.roots.length - 1));

                for (let i = 0; i < N_COINS; i++) {
                    let expectedBeneficiary = new BigNumber(expected.differences[i])
                        .shiftedBy(-tokens[i].decimals)
                        .times(fee_numerator)
                        .div(options.fee.denominator)
                        .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
                        .times(options.fee.beneficiary_numerator)
                        .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                        .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);

                    logger.log(`Beneficiary fee ${tokens[i].symbol}: ${expectedBeneficiary.toString()}`);

                    let expectedReferrer = new BigNumber(expected.differences[i])
                        .shiftedBy(-tokens[i].decimals)
                        .times(fee_numerator)
                        .div(options.fee.denominator)
                        .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
                        .times(options.fee.referrer_numerator)
                        .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                        .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);

                    logger.log(`Referrer fee ${tokens[i].symbol}: ${expectedReferrer.toString()}`);

                    expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[i]).plus(deposits[i]).minus(expectedBeneficiary).minus(expectedReferrer).toString());

                    expectedDexAccount3TokenBalances.push(expectedBeneficiary
                        .plus(dexPoolInfoStart.token_fees[i])
                        .plus(dexAccount3Start.accountBalances[i])
                        .toString());

                    expectedReferrerBalance.push(expectedReferrer.plus(referrerStart.token_balances[i] || 0).toString());
                }
            } else {
                let expectedBeneficiary = new BigNumber(expected.step_2_spent)
                    .shiftedBy(-tokens[0].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[0].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.beneficiary_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[0].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

                let expectedReferrer = new BigNumber(expected.step_2_spent)
                    .shiftedBy(-tokens[0].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[0].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.referrer_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[0].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Referrer fee: ${expectedReferrer.toString()}`);

                expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[0]).plus(deposits[0]).minus(expectedBeneficiary).minus(expectedReferrer).toString());
                expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[1]).plus(deposits[1]).toString());

                expectedDexAccount3TokenBalances.push(expectedBeneficiary
                    .plus(dexPoolInfoStart.token_fees[0])
                    .plus(dexAccount3Start.accountBalances[0])
                    .toString());
                expectedDexAccount3TokenBalances.push(dexAccount3Start.accountBalances[1].toString());

                expectedReferrerBalance = referrerStart.token_balances;
                expectedReferrerBalance[0] = expectedReferrer.plus(referrerStart.token_balances[0] || 0).toString();
            }

            expect(dexPoolInfoEnd.lp_supply_actual).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedAccount2TokenBalances[i]).to.equal(dexAccount2End.accountBalances[i], `Wrong DexAccount#2 ${tokens[i].symbol}`);
            }
            expect(expectedDexAccount2Lp).to.equal(dexAccount2End.lp, 'Wrong DexAccount#2 LP');
            expect(expectedAccount2Lp).to.equal(dexAccount2End.walletLp, 'Wrong Account#2 LP');
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(expectedPoolTokenBalances[i]).toNumber()).to.approximately(
                    new BigNumber(dexPoolInfoEnd.token_balances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                    `Wrong DexPool ${tokens[i].symbol}`
                );
            }
            expect(expectedPoolLp).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong DexPool LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(expectedDexAccount3TokenBalances[i]).to.equal(new BigNumber(dexAccount3End.accountBalances[i]).plus(dexPoolInfoEnd.token_fees[i]).toString(), 'Wrong beneficiary fee');
            }
            console.log('expectedReferrerBalance: ', expectedReferrerBalance);
            for (let i = 0; i < N_COINS; i++) {
                if(expectedReferrerBalance[i]) {
                    expect(new BigNumber(expectedReferrerBalance[i]).toNumber()).to.approximately(
                        new BigNumber(referrerEnd.token_balances[i]).toNumber(),
                        new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                        'Wrong referrer fee'
                    );
                }
            }
        });
    });

    describe('Direct deposit', async function () {
        it('Account#2 deposit Coin2 liquidity', async function () {
            logger.log('#################################################');
            logger.log(`# Account#2 deposit ${tokens[1].symbol} liquidity`);
            const accountStart = await account2balances();
            const dexPoolInfoStart = await dexPoolInfo();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const referrerStart = await account4balances();

            logger.log(`Account#2 balance start: ` +
                `${accountStart.token_balances[0] !== undefined ? accountStart.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountStart.token_balances[1] !== undefined ? accountStart.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3Start.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPool start: ` +
                `${dexPoolInfoStart.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoStart.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoStart.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoStart.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`);
            let logs = `Account#4 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            const TOKENS_TO_DEPOSIT = 100;

            const deposits = new Array(N_COINS).fill(0);
            deposits[1] = TOKENS_TO_DEPOSIT;
            const amounts = new Array(N_COINS).fill(0);
            amounts[1] = new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(tokens[1].decimals).toString();

            let expected;
            let LP_REWARD;
            if (options.pool_contract_name === 'DexPair') {
                expected = await DexPool.call({
                    method: 'expectedDepositLiquidity', params: {
                        left_amount: 0,
                        right_amount: new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(tokens[1].decimals).toString(),
                        auto_change: true
                    }
                });

                LP_REWARD = new BigNumber(expected.step_1_lp_reward)
                    .plus(expected.step_3_lp_reward).shiftedBy(-9).toString();

                logExpectedDeposit(
                    expected,
                    tokens
                );
            } else if (options.pool_contract_name === 'DexStablePair') {
                expected = await DexPool.call({
                    method: 'expectedDepositLiquidityV2',
                    params: {
                        amounts
                    }
                });

                LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

                logExpectedDepositV2(expected, tokens);
            } else if (options.pool_contract_name === 'DexStablePool') {
                expected = await DexPool.call({
                    method: 'expectedDepositLiquidityOneCoin',
                    params: {
                        spent_token_root: tokenRoots[1].address,
                        amount: amounts[1]
                    }
                });

                LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

                logExpectedDepositV2(expected, tokens);
            }

            let payload;
            if (options.pool_contract_name === 'DexStablePool') {
                payload = await DexPool.call({
                    method: 'buildDepositLiquidityPayload', params: {
                        id: 0,
                        deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                        expected_amount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS).toString(),
                        recipient: Account2.address,
                        referrer: Account2.address
                    }
                });
            } else {
                payload = await DexPool.call({
                    method: 'buildDepositLiquidityPayloadV2', params: {
                        _id: 0,
                        _deployWalletGrams: locklift.utils.convertCrystal('0.2', 'nano'),
                        _expectedAmount: new BigNumber(LP_REWARD).shiftedBy(Constants.LP_DECIMALS),
                        _recipient: Account2.address,
                        _referrer: Account2.address
                    }
                });
            }

            tx = await Account2.runTarget({
                contract: tokenWallets2[1],
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_DEPOSIT).shiftedBy(tokens[1].decimals).toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account2.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal('3.3', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const accountEnd = await account2balances();
            const dexPoolInfoEnd = await dexPoolInfo();
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const referrerEnd = await account4balances();

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.token_balances[0] !== undefined ? accountEnd.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountEnd.token_balances[1] !== undefined ? accountEnd.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3End.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPool end: ` +
                `${dexPoolInfoEnd.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoEnd.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoEnd.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoEnd.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`);
            logs = `Account#4 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            await migration.logGas();

            const expectedAccountTokenBalances = accountStart.token_balances;
            expectedAccountTokenBalances[1] = new BigNumber(accountStart.token_balances[1]).minus(TOKENS_TO_DEPOSIT).toString();

            let expectedAccountLp;
            let expectedPoolTokenBalances = [];
            let expectedPoolLp = new BigNumber(dexPoolInfoStart.lp_supply).plus(LP_REWARD).toString();
            let expectedDexAccount3TokenBalances = [];
            let expectedReferrerBalance = [];
            if (options.pool_contract_name === 'DexPair') {
                expectedAccountLp = new BigNumber(accountStart.lp)
                    .plus(new BigNumber(expected.step_3_lp_reward).shiftedBy(-Constants.LP_DECIMALS)).toString();

                let expectedBeneficiary = new BigNumber(expected.step_2_spent)
                    .shiftedBy(-tokens[1].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.beneficiary_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

                let expectedReferrer = new BigNumber(expected.step_2_spent)
                    .shiftedBy(-tokens[1].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.referrer_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Referrer fee: ${expectedReferrer.toString()}`);

                expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[0]).plus(deposits[0]).toString());
                expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[1]).plus(deposits[1]).minus(expectedBeneficiary).minus(expectedReferrer).toString());

                for (let i = 0; i < N_COINS; i++) {
                    expectedDexAccount3TokenBalances[i] = new BigNumber(i === 1 ? expectedBeneficiary : 0)
                        .plus(dexPoolInfoStart.token_fees[i])
                        .plus(dexAccount3Start.accountBalances[i])
                        .toString();
                }

                expectedReferrerBalance = referrerStart.token_balances;
                expectedReferrerBalance[1] = expectedReferrer.plus(referrerStart.token_balances[1] || 0).toString();
            } else if (options.pool_contract_name === 'DexStablePair') {
                expectedAccountLp = new BigNumber(accountStart.lp).plus(LP_REWARD).toString();

                let fee_numerator = new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator).multipliedBy(options.roots.length).dividedBy(4 * (options.roots.length - 1));

                for (let i = 0; i < N_COINS; i++) {
                    let expectedBeneficiary = new BigNumber(expected.differences[i])
                        .shiftedBy(-tokens[i].decimals)
                        .times(fee_numerator)
                        .div(options.fee.denominator)
                        .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
                        .times(options.fee.beneficiary_numerator)
                        .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                        .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);

                    logger.log(`Beneficiary fee ${tokens[i].symbol}: ${expectedBeneficiary.toString()}`);

                    let expectedReferrer = new BigNumber(expected.differences[i])
                        .shiftedBy(-tokens[i].decimals)
                        .times(fee_numerator)
                        .div(options.fee.denominator)
                        .dp(tokens[i].decimals, BigNumber.ROUND_CEIL)
                        .times(options.fee.referrer_numerator)
                        .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                        .dp(tokens[i].decimals, BigNumber.ROUND_FLOOR);

                    logger.log(`Referrer fee ${tokens[i].symbol}: ${expectedReferrer.toString()}`);

                    expectedPoolTokenBalances.push(new BigNumber(dexPoolInfoStart.token_balances[i]).plus(deposits[i]).minus(expectedBeneficiary).minus(expectedReferrer).toString());

                    expectedDexAccount3TokenBalances.push(expectedBeneficiary
                        .plus(dexPoolInfoStart.token_fees[i])
                        .plus(dexAccount3Start.accountBalances[i])
                        .toString());

                    expectedReferrerBalance.push(expectedReferrer.plus(referrerStart.token_balances[i] || 0).toString());
                }
            } else if (options.pool_contract_name === 'DexStablePool') {
                expectedAccountLp = new BigNumber(accountStart.lp).plus(LP_REWARD).toString();

                let expectedBeneficiary = new BigNumber(amounts[1])
                    .shiftedBy(-tokens[1].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.beneficiary_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

                let expectedReferrer = new BigNumber(amounts[1])
                    .shiftedBy(-tokens[1].decimals)
                    .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .div(options.fee.denominator)
                    .dp(tokens[1].decimals, BigNumber.ROUND_CEIL)
                    .times(options.fee.referrer_numerator)
                    .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                    .dp(tokens[1].decimals, BigNumber.ROUND_FLOOR);

                logger.log(`Referrer fee: ${expectedReferrer.toString()}`);

                expectedPoolTokenBalances = dexPoolInfoStart.token_balances;
                expectedPoolTokenBalances[1] = new BigNumber(dexPoolInfoStart.token_balances[1]).plus(deposits[1]).minus(expectedBeneficiary).minus(expectedReferrer).toString();

                for (let i = 0; i < N_COINS; i++) {
                    expectedDexAccount3TokenBalances[i] = new BigNumber(i === 1 ? expectedBeneficiary : 0)
                        .plus(dexPoolInfoStart.token_fees[i])
                        .plus(dexAccount3Start.accountBalances[i])
                        .toString();
                }

                expectedReferrerBalance = referrerStart.token_balances;
                expectedReferrerBalance[1] = expectedReferrer.plus(referrerStart.token_balances[1] || 0).toString();
            }

            expect(dexPoolInfoEnd.lp_supply_actual).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(accountEnd.token_balances[i]).toNumber()).to.approximately(
                    new BigNumber(expectedAccountTokenBalances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                    `Wrong Account#2 ${tokens[i].symbol} balance`
                );
            }
            expect(accountEnd.lp.toString()).to.equal(expectedAccountLp, 'Wrong Account#2 LP balance');
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(expectedPoolTokenBalances[i]).toNumber()).to.approximately(
                    new BigNumber(dexPoolInfoEnd.token_balances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                    `Wrong DexPool ${tokens[i].symbol}`
                );
            }
            expect(expectedPoolLp).to.equal(dexPoolInfoEnd.lp_supply, 'Wrong DexPool LP supply');
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(expectedDexAccount3TokenBalances[i]).toNumber()).to.approximately(
                    new BigNumber(dexAccount3End.accountBalances[i]).plus(dexPoolInfoEnd.token_fees[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                    'Wrong beneficiary fee'
                );
            }
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(expectedReferrerBalance[i]).toNumber()).to.approximately(
                    new BigNumber(referrerEnd.token_balances[i]).toNumber(),
                    new BigNumber(1).shiftedBy(-tokens[i].decimals).toNumber(),
                    'Wrong referrer fee'
                );
            }
        });
    });

    describe('Direct exchanges', async function () {
        it(`Account#2 exchange Coin2 to Coin1`, async function () {
            logger.log('#################################################');
            logger.log(`# Account#2 exchange ${tokens[1].symbol} to ${tokens[0].symbol}`);
            const dexStart = await dexBalances();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const accountStart = await account2balances();
            const dexPoolInfoStart = await dexPoolInfo();
            const referrerStart = await account4balances();

            logger.log(`Account#2 balance start: ` +
                `${accountStart.token_balances[0] !== undefined ? accountStart.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountStart.token_balances[1] !== undefined ? accountStart.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3Start.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPool start: ` +
                `${dexPoolInfoStart.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoStart.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoStart.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoStart.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`);
            let logs = `Account#4 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            const TOKENS_TO_EXCHANGE = 100;

            let expected;
            if (options.roots.length === 2) {
                expected = await DexPool.call({
                    method: 'expectedExchange', params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[1].decimals).toString(),
                        spent_token_root: tokenRoots[1].address
                    }
                });
            } else {
                expected = await DexPool.call({
                    method: 'expectedExchange', params: {
                        amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[1].decimals).toString(),
                        spent_token_root: tokenRoots[1].address,
                        receive_token_root: tokenRoots[0].address
                    }
                });
            }

            logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE.toString()} ${tokens[1].symbol}`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[1].decimals).toString()} ${tokens[1].symbol}`);
            logger.log(`Expected receive amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals).toString()} ${tokens[0].symbol}`);

            let payload;
            if (options.roots.length === 2) {
                payload = await DexPool.call({
                    method: 'buildExchangePayloadV2', params: {
                        _id: 0,
                        _deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                        _expectedAmount: expected.expected_amount,
                        _recipient: Account2.address,
                        _referrer: Account2.address
                    }
                });
            } else {
                payload = await DexPool.call({
                    method: 'buildExchangePayload', params: {
                        id: 0,
                        deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano'),
                        expected_amount: expected.expected_amount,
                        outcoming: tokenRoots[0].address,
                        recipient: Account2.address,
                        referrer: Account2.address
                    }
                });
            }

            tx = await Account2.runTarget({
                contract: tokenWallets2[1],
                method: 'transfer',
                params: {
                    amount: new BigNumber(TOKENS_TO_EXCHANGE).shiftedBy(tokens[1].decimals).toString(),
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account2.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal('3.3', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const accountEnd = await account2balances();
            const dexPoolInfoEnd = await dexPoolInfo();
            const referrerEnd = await account4balances();

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.token_balances[0] !== undefined ? accountEnd.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountEnd.token_balances[1] !== undefined ? accountEnd.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3End.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3End.lp} LP`);
            logger.log(`DexPool end: ` +
                `${dexPoolInfoEnd.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoEnd.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoEnd.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoEnd.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`);
            logs = `Account#4 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(TOKENS_TO_EXCHANGE)
                .shiftedBy(tokens[1].decimals)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-tokens[1].decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedReferrer = new BigNumber(TOKENS_TO_EXCHANGE)
                .shiftedBy(tokens[1].decimals)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.referrer_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-tokens[1].decimals);

            logger.log(`Referrer fee: ${expectedReferrer.toString()}`);

            const expectedReferrerBalanceSpent = expectedReferrer.plus(referrerStart.token_balances[1] || 0).toString();
            const expectedDexAccount3Spent = expectedBeneficiary
                .plus(dexPoolInfoStart.token_fees[1])
                .plus(dexAccount3Start.accountBalances[1])
                .toString();
            const expectedDexReceived = new BigNumber(dexStart.token_balances[0])
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals)).toString();
            const expectedDexSpent = new BigNumber(dexStart.token_balances[1]).plus(TOKENS_TO_EXCHANGE).minus(expectedReferrer).toString();
            const expectedAccountReceived = new BigNumber(accountStart.token_balances[0])
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals)).toString();
            const expectedAccountSpent = new BigNumber(accountStart.token_balances[1]).minus(TOKENS_TO_EXCHANGE).toString();
            const expectedPoolReceived = new BigNumber(dexPoolInfoStart.token_balances[0])
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals)).toString();
            const expectedPoolSpent = new BigNumber(dexPoolInfoStart.token_balances[1]).plus(TOKENS_TO_EXCHANGE).minus(expectedBeneficiary).minus(expectedReferrer).toString();


            expect(expectedDexReceived).to.equal(dexEnd.token_balances[0].toString(), `Wrong DEX ${tokens[0].symbol} balance`);
            expect(expectedDexSpent).to.equal(dexEnd.token_balances[1].toString(), `Wrong DEX ${tokens[1].symbol} balance`);
            expect(expectedAccountReceived).to.equal(accountEnd.token_balances[0].toString(), `Wrong Account#2 ${tokens[0].symbol} balance`);
            expect(expectedAccountSpent).to.equal(accountEnd.token_balances[1].toString(), `Wrong Account#2 ${tokens[1].symbol} balance`);
            expect(expectedPoolReceived).to.equal(dexPoolInfoEnd.token_balances[0].toString(), `Wrong DEXPool ${tokens[0].symbol} balance`);
            expect(expectedPoolSpent).to.equal(dexPoolInfoEnd.token_balances[1].toString(), `Wrong DEXPool ${tokens[1].symbol} balance`);
            expect(expectedDexAccount3Spent).to.equal(new BigNumber(dexAccount3End.accountBalances[1]).plus(dexPoolInfoEnd.token_fees[1]).toString(),
                'Wrong beneficiary fee');
            expect(expectedReferrerBalanceSpent).to.equal(referrerEnd.token_balances[1],
                'Wrong referrer fee');
        });

        it('Account#2 exchange Coin1 to Coin2 (expectedSpendAmount)', async function () {
            logger.log('#################################################');
            logger.log(`# Account#2 exchange ${tokens[0].symbol} to ${tokens[1].symbol}`);
            const dexStart = await dexBalances();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);
            const accountStart = await account2balances();
            const dexPoolInfoStart = await dexPoolInfo();
            const referrerStart = await account4balances();

            logger.log(`Account#2 balance start: ` +
                `${accountStart.token_balances[0] !== undefined ? accountStart.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountStart.token_balances[1] !== undefined ? accountStart.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountStart.lp !== undefined ? accountStart.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance start: ` +
                `${dexAccount3Start.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3Start.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3Start.lp} LP`);
            logger.log(`DexPool start: ` +
                `${dexPoolInfoStart.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoStart.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoStart.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoStart.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoStart.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoStart.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`);
            let logs = `Account#4 balance start: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerStart.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            const TOKENS_TO_RECEIVE = 100;

            let expected;
            if (options.roots.length === 2) {
                expected = await DexPool.call({
                    method: 'expectedSpendAmount', params: {
                        receive_amount: new BigNumber(TOKENS_TO_RECEIVE).shiftedBy(tokens[1].decimals).toString(),
                        receive_token_root: tokenRoots[1].address
                    }
                });
            } else {
                expected = await DexPool.call({
                    method: 'expectedSpendAmount', params: {
                        receive_amount: new BigNumber(TOKENS_TO_RECEIVE).shiftedBy(tokens[1].decimals).toString(),
                        receive_token_root: tokenRoots[1].address,
                        spent_token_root: tokenRoots[0].address,
                    }
                });
            }

            logger.log(`Expected spend amount: ${new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals).toString()} ${tokens[0].symbol}`);
            logger.log(`Expected fee: ${new BigNumber(expected.expected_fee).shiftedBy(-tokens[0].decimals).toString()} ${tokens[0].symbol}`);
            logger.log(`Expected receive amount: ${TOKENS_TO_RECEIVE} ${tokens[1].symbol}`);

            let payload;
            if (options.roots.length === 2) {
                payload = await DexPool.call({
                    method: 'buildExchangePayloadV2', params: {
                        _id: 0,
                        _deployWalletGrams: locklift.utils.convertCrystal('0.2', 'nano'),
                        _expectedAmount: 0,
                        _recipient: Account2.address,
                        _referrer: Account2.address
                    }
                });
            } else {
                payload = await DexPool.call({
                    method: 'buildExchangePayload', params: {
                        id: 0,
                        deploy_wallet_grams: 0,
                        expected_amount: 0,
                        outcoming: tokenRoots[1].address,
                        recipient: Account2.address,
                        referrer: Account2.address
                    }
                });
            }

            tx = await Account2.runTarget({
                contract: tokenWallets2[0],
                method: 'transfer',
                params: {
                    amount: expected.expected_amount,
                    recipient: DexPool.address,
                    deployWalletValue: 0,
                    remainingGasTo: Account2.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal('3.3', 'nano'),
                keyPair: keyPairs[1]
            });

            displayTx(tx);

            const dexEnd = await dexBalances();
            const dexAccount3End = await dexAccountBalances(DexAccount3);
            const accountEnd = await account2balances();
            const dexPoolInfoEnd = await dexPoolInfo();
            const referrerEnd = await account4balances();

            logger.log(`Account#2 balance end: ` +
                `${accountEnd.token_balances[0] !== undefined ? accountEnd.token_balances[0] + ` ${tokens[0].symbol}` : `${tokens[0].symbol} (not deployed)`}, ` +
                `${accountEnd.token_balances[1] !== undefined ? accountEnd.token_balances[1] + ` ${tokens[1].symbol}` : `${tokens[1].symbol} (not deployed)`}, ` +
                `${accountEnd.lp !== undefined ? accountEnd.lp + ' LP' : 'LP (not deployed)'}`);
            logger.log(`DexAccount#3 balance end: ` +
                `${dexAccount3End.accountBalances[0]} ${tokens[0].symbol}, ${dexAccount3End.accountBalances[1]} ${tokens[1].symbol}, ${dexAccount3End.lp} LP`);
            logger.log(`DexPool end: ` +
                `${dexPoolInfoEnd.token_balances[0]} ${tokens[0].symbol}, ${dexPoolInfoEnd.token_balances[1]} ${tokens[1].symbol}, ` +
                `${dexPoolInfoEnd.token_fees[0]} ${tokens[0].symbol} FEE, ${dexPoolInfoEnd.token_fees[1]} ${tokens[1].symbol} FEE, ` +
                `LP SUPPLY (PLAN): ${dexPoolInfoEnd.lp_supply} LP, ` +
                `LP SUPPLY (ACTUAL): ${dexPoolInfoEnd.lp_supply_actual} LP`);
            logger.log(`DEXVault start: ${dexStart.token_balances[0]} ${tokens[0].symbol}, ${dexStart.token_balances[1]} ${tokens[1].symbol}`);
            logs = `Account#4 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${referrerEnd.token_balances[i] || 0} ${tokens[i].symbol}, `;
            }
            logger.log(logs);

            await migration.logGas();

            let expectedBeneficiary = new BigNumber(expected.expected_amount)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.beneficiary_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-tokens[0].decimals);

            logger.log(`Beneficiary fee: ${expectedBeneficiary.toString()}`);

            let expectedReferrer = new BigNumber(expected.expected_amount)
                .times(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .div(options.fee.denominator)
                .dp(0, BigNumber.ROUND_CEIL)
                .times(options.fee.referrer_numerator)
                .div(new BigNumber(options.fee.pool_numerator).plus(options.fee.beneficiary_numerator).plus(options.fee.referrer_numerator))
                .dp(0, BigNumber.ROUND_FLOOR)
                .shiftedBy(-tokens[0].decimals);

            logger.log(`Referrer fee: ${expectedReferrer.toString()}`);

            const expectedReferrerBalanceSpent = expectedReferrer.plus(referrerStart.token_balances[0] || 0).toString();

            const expectedDexAccount3Spent = expectedBeneficiary
                .plus(dexPoolInfoStart.token_fees[0])
                .plus(dexAccount3Start.accountBalances[0])
                .toString();

            const expectedDexReceived = new BigNumber(dexStart.token_balances[1])
                .minus(TOKENS_TO_RECEIVE).toString();
            const expectedDexSpent = new BigNumber(dexStart.token_balances[0])
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals)).minus(expectedReferrer).toString();
            const expectedAccountReceived = new BigNumber(accountStart.token_balances[1])
                .plus(TOKENS_TO_RECEIVE).toString();
            const expectedAccountSpent = new BigNumber(accountStart.token_balances[0])
                .minus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals)).toString();
            const expectedPoolSpent = new BigNumber(dexPoolInfoStart.token_balances[0])
                .plus(new BigNumber(expected.expected_amount).shiftedBy(-tokens[0].decimals))
                .minus(expectedBeneficiary).minus(expectedReferrer).toString();
            const expectedPoolReceived = new BigNumber(dexPoolInfoStart.token_balances[1]).minus(TOKENS_TO_RECEIVE).toString();

            expect(expectedAccountSpent).to.equal(accountEnd.token_balances[0].toString(), `Wrong Account#2 ${tokens[0].symbol} balance`);
            expect(expectedAccountReceived).to.equal(accountEnd.token_balances[1].toString(), `Wrong Account#2 ${tokens[1].symbol} balance`);
            expect(
                new BigNumber(expectedPoolSpent).toNumber()
            ).to.approximately(
                new BigNumber(dexPoolInfoEnd.token_balances[0]).toNumber(),
                new BigNumber(1).shiftedBy(-Constants.LP_DECIMALS).toNumber(),
                `Wrong DEXPool ${tokens[0].symbol} balance`
            );
            expect(expectedPoolReceived).to.equal(dexPoolInfoEnd.token_balances[1].toString(), `Wrong DEXPool ${tokens[1].symbol} balance`);
            expect(expectedDexAccount3Spent).to.equal(new BigNumber(dexAccount3End.accountBalances[0]).plus(dexPoolInfoEnd.token_fees[0]).toString(),
                `Wrong DexAccount ${tokens[0].symbol} balance`);
            expect(new BigNumber(expectedReferrerBalanceSpent).toNumber()).to.approximately(
                new BigNumber(referrerEnd.token_balances[0]).toNumber(),
                new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
                'Wrong referrer fee');
            expect(new BigNumber(expectedDexSpent).toNumber()).to.approximately(
                new BigNumber(dexEnd.token_balances[0]).toNumber(),
                new BigNumber(1).shiftedBy(-tokens[0].decimals).toNumber(),
                `Wrong DEX ${tokens[0].symbol} balance`);
            expect(new BigNumber(expectedDexReceived).toNumber()).to.approximately(
                new BigNumber(dexEnd.token_balances[1]).toNumber(),
                new BigNumber(1).shiftedBy(-tokens[1].decimals).toNumber(),
                `Wrong DEX ${tokens[1].symbol} balance`);
        });
    });

    describe('Withdraw beneficiary fee', async function () {
        it('Account#3 withdraw fee', async function () {
            logger.log('#################################################');
            logger.log('# DexPool.withdrawBeneficiaryFee');
            const dexPoolInfoStart = await dexPoolInfo();
            const dexAccount3Start = await dexAccountBalances(DexAccount3);

            let logs = 'DexAccount#3 balance start: ';
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount3Start.accountBalances[i]} ${tokens[i].symbol}` + (i === N_COINS - 1 ? '' : ', ');
            }
            logger.log(logs);
            logs = '';
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexPoolInfoStart.token_fees[i]} ${tokens[i].symbol} FEE` + (i === N_COINS - 1 ? '' : ', ');
            }
            logger.log(logs);

            tx = await Account3.runTarget({
                contract: DexPool,
                method: 'withdrawBeneficiaryFee',
                params: {
                    send_gas_to: Account3.address
                },
                value: locklift.utils.convertCrystal('1', 'nano'),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const dexPoolInfoEnd = await dexPoolInfo();
            const dexAccount3End = await dexAccountBalances(DexAccount3);

            logs = `DexAccount#3 balance end: `;
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexAccount3End.accountBalances[i]} ${tokens[i].symbol}` + (i === N_COINS - 1 ? '' : ', ');
            }
            logger.log(logs);
            logs = '';
            for (let i = 0; i < N_COINS; i++) {
                logs += `${dexPoolInfoEnd.token_fees[i]} ${tokens[i].symbol} FEE` + (i === N_COINS - 1 ? '' : ', ');
            }
            logger.log(logs);

            await migration.logGas();

            for (let i = 0; i < N_COINS; i++) {
                expect(dexPoolInfoEnd.token_fees[i]).to.equal('0',`Wrong ${tokens[i].symbol} pool fee`)
            }
            for (let i = 0; i < N_COINS; i++) {
                expect(new BigNumber(dexAccount3Start.accountBalances[i]).plus(dexPoolInfoStart.token_fees[i]).toString())
                    .to.equal(new BigNumber(dexAccount3End.accountBalances[i]).plus(dexPoolInfoEnd.token_fees[i]).toString(),
                    `Wrong ${tokens[i].symbol} beneficiary fee`);
            }
        });
    });
});
