import { writeFileSync } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Migration } = require(process.cwd() + '/scripts/utils');

const OLD_DEX_ACCOUNT_CODE_HASH =
  'ed649f47322294142e5cc1ae3387cc46e208eb480b5b7e8746b306e83a66cb6b';

async function main() {
  const migration = new Migration();

  const dexRoot = await locklift.factory.getDeployedContract(
    'DexRoot',
    migration.getAddress('DexRoot'),
  );

  const dexAccountsToUpdate = [];
  let continuation = undefined;
  let hasResults = true;
  while (hasResults) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = await locklift.provider.getAccountsByCodeHash({
      codeHash: OLD_DEX_ACCOUNT_CODE_HASH,
      continuation,
      limit: 50,
    });
    continuation = result.continuation;
    hasResults = result.accounts.length === 50;
    for (const dexAccountAddress of result.accounts) {
      const DexAccount = await locklift.factory.getDeployedContract(
        'DexAccount',
        dexAccountAddress,
      );
      const root = (
        await DexAccount.methods.getRoot({ answerId: 0 }).call({})
      ).value0.toString();
      if (root === dexRoot.address.toString()) {
        const owner = (
          await DexAccount.methods.getOwner({ answerId: 0 }).call({})
        ).value0.toString();
        console.log(
          `DexAccount ${dexAccountAddress.toString()}, owner = ${owner}`,
        );
        dexAccountsToUpdate.push({
          dexAccount: dexAccountAddress.toString(),
          owner: owner,
        });
      }
    }
  }
  writeFileSync(
    './dex_accounts.json',
    JSON.stringify(dexAccountsToUpdate, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
