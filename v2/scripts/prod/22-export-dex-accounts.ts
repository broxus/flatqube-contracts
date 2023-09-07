import { writeFileSync } from "fs";
import { Address } from "locklift";
import { yellowBright } from "chalk";
import { DexRootAbi } from "build/factorySource";

const OLD_DEX_ACCOUNT_CODE_HASH =
  "345a26f10e059ebca100974c51b39bfb241b937f2e27e7f235b3950242682b2d";

type AccountEntity = {
  dexAccount: Address;
  owner: Address;
};

async function main() {
  await locklift.deployments.load();
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  console.log("DexRoot: " + dexRoot.address);

  let continuation = undefined;
  let hasResults = true;
  const accounts: Address[] = [];

  const start = Date.now();

  while (hasResults) {
    const result: { accounts: Address[]; continuation: string } =
      await locklift.provider.getAccountsByCodeHash({
        codeHash: OLD_DEX_ACCOUNT_CODE_HASH,
        continuation,
        limit: 50,
      });

    continuation = result.continuation;
    hasResults = result.accounts.length === 50;

    accounts.push(...result.accounts);
  }

  const promises: Promise<AccountEntity | null>[] = [];

  for (const dexAccountAddress of accounts) {
    promises.push(
      new Promise(async resolve => {
        const DexAccount = locklift.factory.getDeployedContract(
          "DexAccount",
          dexAccountAddress,
        );

        const root = await DexAccount.methods
          .getRoot({ answerId: 0 })
          .call({})
          .then(r => r.value0.toString());
        console.log(dexRoot.address.toString());
        if (root === dexRoot.address.toString()) {
          const owner = await DexAccount.methods
            .getOwner({ answerId: 0 })
            .call()
            .then(r => r.value0);

          console.log(`DexAccount ${dexAccountAddress}, owner = ${owner}`);

          resolve({
            dexAccount: dexAccountAddress,
            owner: owner,
          });
        } else {
          console.log(
            yellowBright(
              `DexAccount ${dexAccountAddress} has another root: ${root}`,
            ),
          );
          resolve(null);
        }
      }),
    );
  }

  const dexAccounts = await Promise.all(promises);

  console.log(`Export took ${(Date.now() - start) / 1000} seconds`);

  writeFileSync(
    "./dex_accounts.json",
    JSON.stringify(
      dexAccounts.filter(v => !!v),
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
