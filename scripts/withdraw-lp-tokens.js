const {Migration, Constants, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});


async function main() {
    const account = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
    account.afterRun = afterRun;
    const account3 = migration.load(await locklift.factory.getAccount('Wallet'), 'Account3');
    account3.afterRun = afterRun;
    const [keyPair] = await locklift.keys.getKeyPairs();

    const withdrawals_info = [
        {
            pair: migration.load(await locklift.factory.getContract('DexPairLpWithdrawal'), 'DexPairTstFoo'),
            recipient: account3.address,
            amount: new BigNumber(1).shiftedBy(Constants.LP_DECIMALS)
        }
    ]
    await Promise.all(withdrawals_info.map(async (withdrawal_info) => {
        console.log(`Transfer DexPair's LP tokens:\n\t- pair_address=${withdrawal_info.pair.address}\n\t- recipient=${withdrawal_info.recipient}\n\t- amount=${withdrawal_info.amount}`);

        const tx = await account.runTarget({
            contract: withdrawal_info.pair,
            method: 'withdrawLpToAddress',
            params: {
                _amount: withdrawal_info.amount,
                _recipient: withdrawal_info.recipient,
                _deployWalletGrams: locklift.utils.convertCrystal('0.05', 'nano'),
                _remainingGasTo: account.address,
            },
            value: locklift.utils.convertCrystal(1, 'nano'),
            keyPair
        });
        displayTx(tx);
    }));
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
