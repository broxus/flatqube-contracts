import {Address, toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});


async function main() {
    const signer = await locklift.keystore.getSigner('0');
    const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

    const dexRoot = await locklift.factory.getDeployedContract( 'DexRoot', migration.getAddress('DexRoot'));
    const DexPairLpWithdrawal = await locklift.factory.getContractArtifacts('DexPairLpWithdrawal');

    console.log(`Installing new DexPair contract in DexRoot: ${dexRoot.address}`);
    await dexRoot.methods.installOrUpdatePairCode({code: DexPairLpWithdrawal.code, pool_type: 1}).send({
        from: account.address,
        amount: toNano(5),
    });

    const withdrawals_info = [
        {
            // qube-gre
            pair: await locklift.factory.getDeployedContract('DexPairLpWithdrawal', new Address('0:63464e4f232bbb3be113fa8ff8133b8f4e0fc80fe13f6a6d633dcf5e9b54a6c6')),
            left_root: "0:9f20666ce123602fd7a995508aeaa0ece4f92133503c0dfbd609b3239f3901e2",
            right_root: "0:fde4c629d6447fecd86d2cffe363d5f334030351022bad019e0f472212e9dc99",
            recipient: '0:0',
            amount: '5734881833'
        },
        {
            // purrbox-usdt
            pair: await locklift.factory.getDeployedContract('DexPairLpWithdrawal', new Address('0:f320c5c93e5af795aa9c476aafd141f94bfcd3f3967428a5693f767179136ebe')),
            left_root: "0:8f1f17c9e6788ae6e1c9038ce6eebfb126cd6024dec0db86381976da8a3636e8",
            right_root: "0:a519f99bb5d6d51ef958ed24d337ad75a1c770885dcd42d51d6663f9fcdacfb2",
            recipient: '0:0',
            amount: "400000000"
        },
        {
            // start-qube
            pair: await locklift.factory.getDeployedContract('DexPairLpWithdrawal', new Address('0:5088b53b4e7889002b7ad42080934d4877fe6280d30e3b2efe68c27652452970')),
            left_root: "0:7d7af239168cfd06353c224aa8b5e805846ae5e556f66fa8e045b5e1ba29e82a",
            right_root: "0:9f20666ce123602fd7a995508aeaa0ece4f92133503c0dfbd609b3239f3901e2",
            recipient: '0:0',
            amount: "95680000000"
        },
        {
            // qube-usdt
            pair: await locklift.factory.getDeployedContract('DexPairLpWithdrawal', new Address('0:e691a6cc2b55c33ccf40b8554d91349e436e18fc580b5b8f609513b2e423aba6')),
            left_root: "0:9f20666ce123602fd7a995508aeaa0ece4f92133503c0dfbd609b3239f3901e2",
            right_root: "0:a519f99bb5d6d51ef958ed24d337ad75a1c770885dcd42d51d6663f9fcdacfb2",
            recipient: '0:0',
            amount: "1320987752229"
        },
        {
            // phx-eupi
            pair: await locklift.factory.getDeployedContract('DexPairLpWithdrawal', new Address('0:4aa36862afad89f700ee69fecbcbba1a0a190f31d26e8acdf018c8322e5e7e79')),
            left_root: "0:01c8c8c678456e3bfbda8c8f655276b39af278a6527f3c42d8d1076ee6a68f5c",
            right_root: "0:0cfa60f9454b1b619938c4da6a138b1cc62da937b3f6c0506405daf2a88e0115",
            recipient: '0:0',
            amount: "400000000000"
        }
    ]
    await Promise.all(withdrawals_info.map(async (withdrawal_info) => {
        console.log(`Upgrading DexPair contract: 
        - left=${withdrawal_info.left_root}
        - right=${withdrawal_info.right_root}`);

        let tx = await locklift.transactions.waitFinalized(dexRoot.methods.upgradePair(
            {
                left_root: new Address(withdrawal_info.left_root),
                right_root: new Address(withdrawal_info.right_root),
                send_gas_to: account.address,
                pool_type: 1
            }
        ).send({
            from: account.address,
            amount: toNano(6)
        }));
        displayTx(tx);

        console.log(`Transfer DexPair's LP tokens:\n\t- pair_address=${withdrawal_info.pair.address}\n\t- recipient=${withdrawal_info.recipient}\n\t- amount=${withdrawal_info.amount}`);

        tx = await locklift.transactions.waitFinalized(
            withdrawal_info.pair.methods.withdrawLpToAddress(
                {
                    _amount: withdrawal_info.amount,
                    _recipient: new Address(withdrawal_info.recipient),
                    _deployWalletGrams: toNano(0.05),
                    _remainingGasTo: account.address,
                }
            ).send({
                from: account.address,
                amount: toNano(1)
            })
        );
        displayTx(tx);
    }));
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
