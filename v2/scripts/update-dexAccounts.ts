import {toNano, WalletTypes} from "locklift";
import {Account} from "everscale-standalone-client/nodejs";

const {Migration, displayTx} = require(process.cwd() + '/scripts/utils')
const migration = new Migration();

async function main() {
  const rootOwner = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: migration.getAddress('Account1')
  });
  const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));
  const DexAccount = await locklift.factory.getContractArtifacts('DexAccount');

  console.log(`Installing new DexAccount contract in DexRoot: ${dexRoot.address}`);
  await locklift.transactions.waitFinalized(dexRoot.methods.installOrUpdateAccountCode(
      {code: DexAccount.code}
  ).send({
    from: rootOwner.address,
    amount: toNano(1)
  }));

  const accounts_to_force_update: Account[] = [];
  await Promise.all([1, 2, 3].filter((n) => migration.exists('DexAccount' + n)).map(async (n) => {
    console.log(`Add DexAccount ${n} to upgrade`);

    const account = await locklift.factory.accounts.addExistingAccount({
      type: WalletTypes.EverWallet,
      address: migration.getAddress('Account' + n)
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
