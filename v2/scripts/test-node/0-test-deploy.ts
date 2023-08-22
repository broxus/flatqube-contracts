import {
  getWallet,
  depositLiquidity,
  getDexAccountData,
  getPoolData,
} from "../../../utils/wrappers";
import {
  expectedDepositLiquidity,
  expectedExchange,
} from "../../../utils/expected.utils";
import {
  TokenRootUpgradeableAbi,
  DexAccountAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  DexPairAbi,
} from "build/factorySource";
// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts

// only for testing
async function main() {
  await locklift.deployments.load();

  const mainAcc = locklift.deployments.getAccount("DexOwner").account;
  const token =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-0");
  const token_1 =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-6-1");

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

  const dexOwnerMain = locklift.deployments.getAccount("DexOwner").account;
  const dexAccount =
    locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
  const dexPair = locklift.deployments.getContract<DexPairAbi>(
    "DexPair_token-6-0_token-6-1",
  );
  const dexStablePair = locklift.deployments.getContract<DexStablePairAbi>(
    "DexStablePair_token-6-0_token-9-0",
  );
  const dexPool = locklift.deployments.getContract<DexStablePoolAbi>(
    "DexStablePool_token-6-0_token-9-0_token-18-0",
  );

  const token2 =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-9-0");
  const token3 =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-18-0");
  const res = await getWallet(mainAcc.address, token.address);
  console.log(res.walletContract.address, "----res");

  const resDeposit = await depositLiquidity(
    dexOwnerMain.address,
    dexAccount,
    dexStablePair,
    [
      {
        root: token.address,
        amount: 100,
      },
      {
        root: token2.address,
        amount: 100000,
      },
    ],
  );

  const res3 = await getPoolData(dexStablePair);
  console.log(res3, "res3");

  console.log(resDeposit, "----resDeposit");
  const res4 = await getDexAccountData(
    [token2.address, token3.address],
    dexAccount,
  );
  console.log(res4, "res4");

  const res5 = await expectedDepositLiquidity(
    dexPair,
    [
      {
        root: token_1.address,
        amount: 100,
      },
      {
        root: token.address,
        amount: 100,
      },
    ],
    false,
  );
  console.log(res5, "res5");
  const res6 = await expectedExchange(
    dexPool,
    "100",
    token.address,
    token2.address,
  );
  console.log(res6, "res6");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
