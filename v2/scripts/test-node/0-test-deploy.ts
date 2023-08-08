import { getWallet } from "../../../utils/wrappers";
import { TokenRootUpgradeableAbi } from "../../../build/factorySource";
// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts

// for new deploy
// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts --new="1"

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

  const res = await getWallet(mainAcc.address, token.address);
  console.log(res, "----res");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
