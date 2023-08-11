import {
  getWallet,
  depositLiquidity,
  getAccountData,
  getPoolData,
  expectedDepositLiquidity,
} from "../../../utils/wrappers";
import {
  TokenRootUpgradeableAbi,
  DexAccountAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
} from "../../../build/factorySource";
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

  const dexOwnerMain = locklift.deployments.getAccount("DexOwner").account;
  const dexAccount =
    locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
  const dexPair = locklift.deployments.getContract<DexStablePairAbi>(
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
    dexPair,
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

  const res3 = await getPoolData(dexPair);
  console.log(res3, "res3");

  console.log(resDeposit, "----resDeposit");
  const res4 = await getAccountData(
    [token2.address, token3.address],
    dexOwnerMain.address,
  );

  console.log(res4, "res4");

  const res5 = await expectedDepositLiquidity(
    dexPool.address,
    "DexStablePool",
    [
      {
        root: token3.address,
        amount: 100000000000,
      },
      {
        root: token2.address,
        amount: 100000,
      },
      {
        root: token.address,
        amount: 100,
      },
    ],
  );
  console.log(res5, "res5");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
