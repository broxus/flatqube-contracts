import { getWallet, depositLiquidity } from "../../../utils/wrappers";
import {
  TokenRootUpgradeableAbi,
  DexAccountAbi,
  DexPairAbi,
} from "../../../build/factorySource";
import { Address } from "locklift";
// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts

// only for testing
async function main() {
  await locklift.deployments.load();

  const mainAcc = locklift.deployments.getAccount("DexOwner").account;
  const token =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-0");

  // await locklift.deployments.fixture({
  //   include: [
  //     "owner-account",
  //     "dex-gas-values",
  //     "tokens",
  //     "token-wallets",
  //     "common-accounts",
  //     "token-factory",
  //     "dex-root",
  //     "dex-accounts",
  //     "wever",
  //     "ever-wever-tip3",
  //     "wever-wallets",
  //     "wrap-ever",
  //     "dex-stable",
  //   ],
  // });

  const dexOwner = locklift.deployments.getAccount("DexOwner").account;
  const dexAccount =
    locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
  const dexPair = locklift.deployments.getContract<DexPairAbi>(
    "DexPair_token-6-0_token-6-1",
  );

  const res = await getWallet(mainAcc.address, token.address);
  console.log(res, "----res");

  const resDeposit = await depositLiquidity(
    dexOwner.address,
    dexAccount,
    dexPair,
    [
      {
        root: new Address(
          "0:13e73b5dd2e43358534f12e2e0bf0206c34480637ad032526191617c140043a2",
        ),
        amount: 100,
      },
      {
        root: new Address(
          "0:05982b345afc429e86e597971034f066ef9f8ebca0ff4ef8b3ae0c8a4b2fdd4b",
        ),
        amount: 100,
      },
    ],
  );
  console.log(resDeposit, "----resDeposit");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
