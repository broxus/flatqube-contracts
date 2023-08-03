import { toNano } from "locklift";
import { Constants, displayTx } from "../../v2/utils/migration";
import {
  DexRootAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
  DexPairAbi,
} from "../../build/factorySource";
import { TOKENS_N, TOKENS_DECIMALS } from "../tokensDeploy/10-deploy-tokens";
import { DexAccountAbi } from "../../build/factorySource";

export default async () => {
  console.log("10-deploy-dex-pairs.js");
  await locklift.deployments.load();

  const dexOwner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  // const dexAccount =
  //   locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

  locklift.tracing.setAllowedCodesForAddress(dexOwner.address, {
    compute: [100],
  });

  const deployDexPairFunc = async (lToken = "foo", rToken = "bar") => {
    const pairs = [[lToken, rToken]];
    await locklift.deployments.load();

    for (const p of pairs) {
      const tokenLeft = {
        name: p[0],
        symbol: p[0],
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      };
      const tokenRight = {
        name: [p[1]],
        symbol: p[1],
        decimals: Constants.LP_DECIMALS,
        upgradeable: true,
      };

      const pair = { left: tokenLeft.symbol, right: tokenRight.symbol };

      console.log(`Start deploy pair DexPair_${pair.left}_${pair.right}`);

      const tokenFoo =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.left);
      const tokenBar =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.right);

      const leftSplit = pair.left.split("-");
      const rightSplit = pair.right.split("-");

      // // taking decimal of token + number of
      // const tokenFooOwner =
      //   locklift.deployments.getContract<TokenWalletUpgradeableAbi>(
      //     `ownerWallet-${leftSplit[leftSplit.length - 2]}-${
      //       leftSplit[leftSplit.length - 1]
      //     }`,
      //   );
      // const tokenBarOwner =
      //   locklift.deployments.getContract<TokenWalletUpgradeableAbi>(
      //     `ownerWallet-${rightSplit[rightSplit.length - 2]}-${
      //       rightSplit[rightSplit.length - 1]
      //     }`,
      //   );

      // deploying real PAIR
      const tx = await locklift.transactions.waitFinalized(
        dexRoot.methods
          .deployPair({
            left_root: tokenFoo.address,
            right_root: tokenBar.address,
            send_gas_to: dexOwner.address,
          })
          .send({
            from: dexOwner.address,
            amount: toNano(15),
          }),
      );

      displayTx(tx.extTransaction, "deploy pair");

      // // adding PAIR to dexAccount for liquidity
      // const txAddPair = await locklift.transactions.waitFinalized(
      //   dexAccount.methods
      //     .addPair({
      //       left_root: tokenFoo.address,
      //       right_root: tokenBar.address,
      //     })
      //     .send({
      //       from: dexOwner.address,
      //       amount: toNano(5),
      //     }),
      // );
      //
      // console.log("txAddPair created");
      // displayTx(txAddPair.extTransaction, "pair create tx");

      const dexPairFooBarAddress = await dexRoot.methods
        .getExpectedPairAddress({
          answerId: 0,
          left_root: tokenFoo.address,
          right_root: tokenBar.address,
        })
        .call()
        .then(r => r.value0);

      console.log(
        `DexPair_${pair.left}_${pair.right}: ${dexPairFooBarAddress}`,
      );

      const dexPairFooBar = locklift.factory.getDeployedContract(
        "DexPair",
        dexPairFooBarAddress,
      );

      await locklift.deployments.saveContract({
        contractName: "DexPair",
        deploymentName: `DexPair_${pair.left}_${pair.right}`,
        address: dexPairFooBarAddress,
      });

      locklift.deployments.deploymentsStore = {
        [`DexPair_${pair.left}_${pair.right}`]: dexPairFooBar,
      };

      const version = (
        await dexPairFooBar.methods.getVersion({ answerId: 0 }).call()
      ).version;
      console.log(`DexPair_${pair.left}_${pair.right} version = ${version}`);

      const active = (
        await dexPairFooBar.methods.isActive({ answerId: 0 }).call()
      ).value0;
      console.log(`DexPair_${pair.left}_${pair.right} active = ${active}`);

      const FooBarLpRoot = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        (await dexPairFooBar.methods.getTokenRoots({ answerId: 0 }).call()).lp,
      );

      // const FooPairWallet = locklift.factory.getDeployedContract(
      //   "TokenWalletUpgradeable",
      //   (
      //     await tokenFoo.methods
      //       .walletOf({
      //         answerId: 0,
      //         walletOwner: dexOwner.address,
      //       })
      //       .call()
      //   ).value0,
      // );

      // const BarPairWallet = locklift.factory.getDeployedContract(
      //   "TokenWalletUpgradeable",
      //   (
      //     await tokenBar.methods
      //       .walletOf({
      //         answerId: 0,
      //         walletOwner: dexOwner.address,
      //       })
      //       .call()
      //   ).value0,
      // );
      //
      // // sending tokens to DEX account + deposit liq
      // const txTransferFoo = await locklift.transactions.waitFinalized(
      //   tokenFooOwner.methods
      //     .transfer({
      //       amount: 10 ** 16,
      //       recipient: dexAccount.address,
      //       deployWalletValue: 0,
      //       remainingGasTo: dexOwner.address,
      //       notify: true,
      //       payload: null,
      //     })
      //     .send({
      //       from: dexOwner.address,
      //       amount: toNano(2),
      //     }),
      // );
      //
      // const txTransferBar = await locklift.transactions.waitFinalized(
      //   tokenBarOwner.methods
      //     .transfer({
      //       amount: 10 ** 16,
      //       recipient: dexAccount.address,
      //       deployWalletValue: 0,
      //       remainingGasTo: dexOwner.address,
      //       notify: true,
      //       payload: null,
      //     })
      //     .send({
      //       from: dexOwner.address,
      //       amount: toNano(2),
      //     }),
      // );
      //
      // displayTx(txTransferFoo.extTransaction);
      // displayTx(txTransferBar.extTransaction);
      //
      // const txDepositLiq = await locklift.transactions.waitFinalized(
      //   dexAccount.methods
      //     .depositLiquidityV2({
      //       _callId: 123,
      //       _operations: [
      //         { amount: 10 ** 16, root: tokenFoo.address },
      //         { amount: 10 ** 16, root: tokenBar.address },
      //       ],
      //       _expected: { amount: "0", root: FooBarLpRoot.address },
      //       _autoChange: false,
      //       _remainingGasTo: dexOwner.address,
      //       _referrer: dexOwner.address,
      //     })
      //     .send({
      //       from: dexOwner.address,
      //       amount: toNano(4),
      //     }),
      // );
      //
      // console.log("______txDepositLiq______");
      // displayTx(txDepositLiq.extTransaction);
      // console.log("______txDepositLiq______");
      //
      // // sending tokens to DEX account + deposit liq
      //
      const FooBarLpPairWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await FooBarLpRoot.methods
            .walletOf({
              answerId: 0,
              walletOwner: dexPairFooBarAddress,
            })
            .call()
        ).value0,
      );

      const FooTokenVault = (
        await dexRoot.methods
          .getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: tokenFoo.address,
          })
          .call()
      ).value0;

      const FooVaultWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenFoo.methods
            .walletOf({
              answerId: 0,
              walletOwner: FooTokenVault,
            })
            .call()
        ).value0,
      );

      const BarTokenVault = (
        await dexRoot.methods
          .getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: tokenBar.address,
          })
          .call()
      ).value0;

      const BarVaultWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenBar.methods
            .walletOf({
              answerId: 0,
              walletOwner: BarTokenVault,
            })
            .call()
        ).value0,
      );

      const FooBarLpTokenVault = (
        await dexRoot.methods
          .getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: FooBarLpRoot.address,
          })
          .call()
      ).value0;

      const FooBarLpVaultWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await FooBarLpRoot.methods
            .walletOf({
              answerId: 0,
              walletOwner: FooBarLpTokenVault,
            })
            .call()
        ).value0,
      );
      //
      // const pairContract = locklift.deployments.getContract<DexPairAbi>(
      //   `DexPair_${pair.left}_${pair.right}`,
      // );
      //
      // const pairBalances = await pairContract.methods
      //   .getBalances({ answerId: 0 })
      //   .call();
      //
      // console.log("Pair balances: ", pairBalances.value0);
      console.log("05-deploy-dex-pairs.js END");

      locklift.deployments.deploymentsStore = {
        [`${pair.left}_${pair.right}LpRoot`]: FooBarLpRoot,
      };
      // locklift.deployments.deploymentsStore = {
      //   [`${pair.left}_${pair.right}Wallet`]: FooPairWallet,
      // };
      // locklift.deployments.deploymentsStore = {
      //   [`Pool_${pair.left}_${pair.right}`]: BarPairWallet,
      // };
      locklift.deployments.deploymentsStore = {
        [`${pair.left}_${pair.right}Pool_LpWallet`]: FooBarLpPairWallet,
      };
      locklift.deployments.deploymentsStore = {
        [`${pair.left}_VaultWallet`]: FooVaultWallet,
      };
      locklift.deployments.deploymentsStore = {
        [`${pair.right}_VaultWallet`]: BarVaultWallet,
      };
      locklift.deployments.deploymentsStore = {
        [`${pair.left}_${pair.right}LpVaultWallet`]: FooBarLpVaultWallet,
      };
    }
  };

  // creating 25 pairs of tokens, 5 tokens, token-1 --- token-any
  const allPairs: [string, string][] = [];

  Array.from({ length: TOKENS_N }).map(async (_, iLeft) => {
    Array.from({ length: TOKENS_N }).map(async (_, iRight) => {
      Array.from({ length: TOKENS_DECIMALS.length - 1 }).map(
        async (_, iDecimal) => {
          if (iLeft === iRight) return;
          if (iLeft > iRight) return;
          allPairs.push([
            `token-${TOKENS_DECIMALS[iDecimal]}-${iLeft}`,
            `token-${TOKENS_DECIMALS[iDecimal]}-${iRight}`,
          ]);
        },
      );
    });
  });

  console.log(allPairs, "allPairs");
  for (let i = 0; i < allPairs.length; i++) {
    // await deployDexPairFunc(`token-0`, `token-2`);
    await deployDexPairFunc(allPairs[i][0], allPairs[i][1]);
  }
};

export const tag = "dex-pairs";

export const dependencies = [
  "owner-account",
  "token-factory",
  "tokens",
  "dex-root",
];
