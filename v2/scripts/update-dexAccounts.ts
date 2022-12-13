import {toNano, WalletTypes} from "locklift";

const {Migration, afterRun, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();

async function main() {
  const signer = await locklift.keystore.getSigner('0');
  const rootOwner = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});

  const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));
  const DexAccount = await locklift.factory.getContractArtifacts('DexAccount');

  console.log(`Installing new DexAccount contract in DexRoot: ${dexRoot.address}`);
  await locklift.transactions.waitFinalized(dexRoot.methods.installOrUpdateAccountCode(
      {code: DexAccount.code}
  ).send({
    from: rootOwner.address,
    amount: toNano(1)
  }));

  const accounts_to_force_update = [];
  await Promise.all([1, 2, 3].filter((key) => migration.exists('DexAccount' + key)).map(async (key) => {
    console.log(`Add DexAccount ${key} to upgrade`);

    const signer = await locklift.keystore.getSigner(key.toString());
    const account = await locklift.factory.accounts.addExistingAccount({
      type: WalletTypes.WalletV3,
      publicKey: signer!.publicKey
    });
    accounts_to_force_update.push(account);
  }));

  await Promise.all(accounts_to_force_update.map(async (account) => {
    console.log(`Upgrading DexAccount contract: owner=${account.address}`);

    const tx = await locklift.transactions.waitFinalized(dexRoot.methods.forceUpgradeAccount(
        {
          account_owner: account.address,
          send_gas_to: account.address
        }
    ).send({
      from: rootOwner.address,
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
