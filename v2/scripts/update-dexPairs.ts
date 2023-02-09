import {toNano, WalletTypes} from "locklift";

const {Migration, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();

async function main() {
    const account = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: migration.getAddress('Account1')
    });
    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));
    const NewDexPair = await locklift.factory.getContractArtifacts('DexPair');

    console.log(`Installing new DexPair contract in DexRoot: ${dexRoot.address}`);
    await locklift.transactions.waitFinalized(
        dexRoot.methods.installOrUpdatePairCode(
            {code: NewDexPair.code, pool_type: 1}
        ).send({
            from: account.address,
            amount: toNano(1)
        })
    );

    const pairs_to_update = [
        {
            left: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('CoinRoot')),
            right: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('FooRoot'))
        },
        // {
        //   left: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('FooRoot')),
        //   right: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('BarRoot'))
        // },
        {
            left: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('TstRoot')),
            right: await locklift.factory.getDeployedContract('TokenRootUpgradeable', migration.getAddress('FooRoot'))
        }
    ]
    await Promise.all(pairs_to_update.map(async (pair) => {
        console.log(`Upgrading DexPair contract:\n\t- left=${pair.left.address}\n\t- right=${pair.right.address}`);

        const tx = await locklift.transactions.waitFinalized(
            dexRoot.methods.upgradePair(
                {
                    left_root: pair.left.address,
                    right_root: pair.right.address,
                    pool_type: 1,
                    send_gas_to: account.address
                }
            ).send({
                from: account.address,
                amount: toNano(6)
            }));
        displayTx(tx);
    }));
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
