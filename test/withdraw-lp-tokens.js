const {expect} = require('chai');
const {
    Migration, afterRun, Constants, TOKEN_CONTRACTS_PATH, displayTx, expectedDepositLiquidity
} = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const program = new Command();
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});
const logger = require('mocha-logger');

program
    .allowUnknownOption()
    .option('-r, --roots <roots>', 'DexPair tokens list')
    .option('-pcn, --pair_contract_name <pair_contract_name>', 'DexPair contract name')

program.parse(process.argv);

const options = program.opts();
options.pair_contract_name = options.pair_contract_name || 'DexPairLpWithdrawal';
options.roots = options.roots ? JSON.parse(options.roots) : ['tst', 'foo'];

let tx;

const migration = new Migration();

let dexRoot
let dexVault;
let dexPair;
let pairLpVaultWallet;
let pairLpPoolWallet;
let pairLpRoot;
let account;
let accountLpWallet;
let account3;
let account3LpWallet;
let account3LeftTokenWallet;
let account3RightTokenWallet

const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';

let keyPairs;

async function account3LpBalance() {
    let lp;
    await account3LpWallet.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });
    const ton = await locklift.utils.convertCrystal((await locklift.ton.getBalance(account3.address)), 'ton').toNumber();
    return lp;
}

async function dexPairLpBalance() {
    let lp;
    await pairLpPoolWallet.call({method: 'balance', params: {}}).then(n => {
        lp = new BigNumber(n).shiftedBy(-Constants.LP_DECIMALS).toString();
    }).catch(e => {/*ignored*/
    });

    return lp
}

function logBalances(header, account, pair) {
    logger.log(`DexPair ${header}: ` +
        `LP: ${pair || "0"} LP, `);
    logger.log(`Account balance ${header}: ` +
        `${account + ' LP'}`);
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

describe(`Check lp withdrawal`, async function () {
    this.timeout(Constants.TESTS_TIMEOUT);
    before('Load contracts', async function () {
        keyPairs = await locklift.keys.getKeyPairs();

        let pairName = Constants.tokens[options.roots[0]].symbol + Constants.tokens[options.roots[1]].symbol;

        dexRoot = migration.load(await locklift.factory.getContract('DexRoot'), 'DexRoot');
        dexVault = migration.load(await locklift.factory.getContract('DexVault'), 'DexVault');
        dexPair = migration.load(await locklift.factory.getContract(options.pair_contract_name), 'DexPair' + pairName);
        pairLpRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        pairLpVaultWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        pairLpPoolWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
        account.afterRun = afterRun;
        account3 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account3');
        account3.afterRun = afterRun;
        accountLpWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        account3LpWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        account3LeftTokenWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);
        account3RightTokenWallet = await locklift.factory.getContract('TokenWalletUpgradeable', TOKEN_CONTRACTS_PATH);

        let tokenRoots = await dexPair.call({method: 'getTokenRoots', params: {}});
        const leftRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        const rightRoot = await locklift.factory.getContract('TokenRootUpgradeable', TOKEN_CONTRACTS_PATH);
        leftRoot.setAddress(tokenRoots.left);
        rightRoot.setAddress(tokenRoots.right);

        account3LeftTokenWallet.setAddress(await leftRoot.call({
            method: 'walletOf',
            params: {
                walletOwner: account3.address
            }
        }));

        account3RightTokenWallet.setAddress(await rightRoot.call({
            method: 'walletOf',
            params: {
                walletOwner: account3.address
            }
        }));

        migration.load(pairLpVaultWallet, pairName + 'LpVaultWallet');
        migration.load(pairLpPoolWallet, pairName + 'Pair_' + 'LpWallet');
        migration.load(pairLpRoot, pairName + 'LpRoot');

        accountLpWallet.setAddress(await pairLpRoot.call({
            method: 'walletOf',
            params: {
                walletOwner: account.address
            }
        }));

        account3LpWallet.setAddress(await pairLpRoot.call({
            method: 'walletOf',
            params: {
                walletOwner: account3.address
            }
        }));

        logger.log(`LP Root: ${pairLpRoot.address}`);
        logger.log(`Vault LP: ${pairLpVaultWallet.address}`);
        logger.log(`Pair LP: ${pairLpPoolWallet.address}`);
        logger.log(`Account LP: ${accountLpWallet.address}`);
        logger.log(`Account3 LP: ${account3LpWallet.address}`);

        logger.log('DexRoot: ' + dexRoot.address);
        logger.log('DexVault: ' + dexVault.address);
        logger.log(`DexPair${pairName}: ` + dexPair.address);
        logger.log('Account: ' + account.address);

        await migration.balancesCheckpoint();
    });

    describe('Withdraw lp tokens', async function () {
        it('Withdraw lp tokens', async function () {
            const tokensAmount = new BigNumber(1000).shiftedBy(Constants.tokens[options.roots[0]].decimals).toString();
            const LP_AMOUNT = await expectedDepositLiquidity(
                dexPair.address,
                options.pair_contract_name,
                [Constants.tokens[options.roots[0]], Constants.tokens[options.roots[1]]],
                [tokensAmount, 0],
                true
            );

            console.log('LP amount: ', LP_AMOUNT);

            const payload = await dexPair.call({
                method: 'buildDepositLiquidityPayload', params: {
                    id: 0,
                    deploy_wallet_grams: locklift.utils.convertCrystal('0.05', 'nano')
                }
            });

            tx = await account3.runTarget({
                contract: account3LeftTokenWallet,
                method: 'transfer',
                params: {
                    amount: tokensAmount,
                    recipient: dexPair.address,
                    deployWalletValue: 0,
                    remainingGasTo: account3.address,
                    notify: true,
                    payload: payload
                },
                value: locklift.utils.convertCrystal('2.3', 'nano'),
                keyPair: keyPairs[2]
            })

            displayTx(tx);

            tx = await account3.runTarget({
                contract: account3LpWallet,
                method: 'transfer',
                params: {
                    amount: new BigNumber(LP_AMOUNT).shiftedBy(Constants.LP_DECIMALS),
                    recipient: dexPair.address,
                    deployWalletValue: 0,
                    remainingGasTo: account3.address,
                    notify: false,
                    payload: EMPTY_TVM_CELL
                },
                value: locklift.utils.convertCrystal('0.2', 'nano'),
                keyPair: keyPairs[2]
            });

            displayTx(tx);

            const accountStart = await account3LpBalance();
            const pairStart = await dexPairLpBalance();
            logBalances('start', accountStart, pairStart);

            await account.runTarget({
                contract: dexPair,
                method: 'withdrawLpToAddress',
                params: {
                    _amount: new BigNumber(LP_AMOUNT).shiftedBy(Constants.LP_DECIMALS),
                    _recipient: account3.address,
                    _deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                    _remainingGasTo: account.address,
                },
                value: locklift.utils.convertCrystal(1, 'nano'),
                keyPair: keyPairs[0]
            });

            const accountEnd = await account3LpBalance();
            const pairEnd = await dexPairLpBalance();
            logBalances('end', accountEnd, pairEnd);
            await logGas();

            console.log()
            expect(new BigNumber(accountStart).plus(LP_AMOUNT).toString()).to.equal(accountEnd, 'Wrong LP balance');
        });
    });
});
