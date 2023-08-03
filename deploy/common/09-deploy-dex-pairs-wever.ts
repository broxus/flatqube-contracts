import { toNano, Contract } from "locklift";
import { Constants, displayTx } from "../../v2/utils/migration";
import {
  DexRootAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
  DexPairAbi,
} from "../../build/factorySource";
import { WEVER_DEXPAIR_AMOUNT } from "./commonAccounts";
import { TOKENS_N } from "../tokensDeploy/10-deploy-tokens";
import { DexAccountAbi } from "../../build/factorySource";

const TOKEN_DECIMAL = 6;

export default async () => {
  console.log("09-deploy-wever-dex-pairs.js");
  await locklift.deployments.load();

  const wEverOwner = locklift.deployments.getAccount("DexOwner").account;

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const ownerDexAccount: Contract<DexAccountAbi> =
    locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

  locklift.tracing.setAllowedCodesForAddress(wEverOwner.address, {
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
      const tokenRightIndex = pair.right.split("-");

      console.log(`Start deploy pair DexPair_${pair.left}_${pair.right}`);

      const tokenFoo =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.left);
      const tokenBar =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pair.right);

      const tokenFooOwner =
        locklift.deployments.getContract<TokenWalletUpgradeableAbi>(
          `ownerWallet-${pair.left}`,
        );
      const tokenBarOwner =
        locklift.deployments.getContract<TokenWalletUpgradeableAbi>(
          `ownerWallet-${TOKEN_DECIMAL}-${
            tokenRightIndex[tokenRightIndex.length - 1]
          }`,
        );

      // deploying real PAIR
      const tx = await locklift.transactions.waitFinalized(
        dexRoot.methods
          .deployPair({
            left_root: tokenFoo.address,
            right_root: tokenBar.address,
            send_gas_to: wEverOwner.address,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(15),
          }),
      );

      displayTx(tx.extTransaction);

      // adding PAIR to dexAccount for liquidity
      const txAddPair = await locklift.transactions.waitFinalized(
        ownerDexAccount.methods
          .addPair({
            left_root: tokenFoo.address,
            right_root: tokenBar.address,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(5),
          }),
      );

      console.log("txAddPair created");
      displayTx(txAddPair.extTransaction);

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

      const FooPairWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenFoo.methods
            .walletOf({
              answerId: 0,
              walletOwner: dexPairFooBarAddress,
            })
            .call()
        ).value0,
      );

      const BarPairWallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        (
          await tokenBar.methods
            .walletOf({
              answerId: 0,
              walletOwner: dexPairFooBarAddress,
            })
            .call()
        ).value0,
      );

      // sending tokens to DEX account + deposit liq
      const txTransferFoo = await locklift.transactions.waitFinalized(
        tokenFooOwner.methods
          .transfer({
            amount: 1000,
            recipient: ownerDexAccount.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: wEverOwner.address,
            notify: true,
            payload: null,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(2),
          }),
      );

      const txTransferBar = await locklift.transactions.waitFinalized(
        tokenBarOwner.methods
          .transfer({
            amount: 10 ** 16,
            recipient: ownerDexAccount.address,
            deployWalletValue: 0,
            remainingGasTo: wEverOwner.address,
            notify: true,
            payload: null,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(2),
          }),
      );

      displayTx(txTransferFoo.extTransaction, "transfer foo");
      displayTx(txTransferBar.extTransaction);

      const txDepositLiq = await locklift.transactions.waitFinalized(
        ownerDexAccount.methods
          .depositLiquidityV2({
            _callId: 123,
            _operations: [
              { amount: WEVER_DEXPAIR_AMOUNT, root: tokenFoo.address },
              { amount: 10 ** 16, root: tokenBar.address },
            ],
            _expected: { amount: "0", root: FooBarLpRoot.address },
            _autoChange: false,
            _remainingGasTo: wEverOwner.address,
            _referrer: wEverOwner.address,
          })
          .send({
            from: wEverOwner.address,
            amount: toNano(4),
          }),
      );

      console.log("______txDepositLiq______");
      displayTx(txDepositLiq.extTransaction);
      console.log("______txDepositLiq______");

      // sending tokens to DEX account + deposit liq

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

      const pairContract = locklift.deployments.getContract<DexPairAbi>(
        `DexPair_${pair.left}_${pair.right}`,
      );

      const pairBalances = await pairContract.methods
        .getBalances({ answerId: 0 })
        .call();

      console.log("Pair balances: ", pairBalances.value0);
      console.log("09-deploy-wever-dex-pairs.js END");

      locklift.deployments.deploymentsStore = {
        [`${pair.left}_${pair.right}LpRoot`]: FooBarLpRoot,
      };
      locklift.deployments.deploymentsStore = {
        [`${pair.left}_${pair.right}Wallet`]: FooPairWallet,
      };
      locklift.deployments.deploymentsStore = {
        [`Pool_${pair.left}_${pair.right}`]: BarPairWallet,
      };
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

  console.log("deploying wever pairs");
  // creating 2 pairs of tokens with wever
  const allWeverPairs: [string, string][] = [];

  Array.from({ length: TOKENS_N }).map(async (_, iRight) => {
    allWeverPairs.push([`weverRoot`, `token-${TOKEN_DECIMAL}-${iRight}`]);
  });

  for (let i = 0; i < allWeverPairs.length; i++) {
    // await deployDexPairFunc(`token-0`, `token-2`);
    await deployDexPairFunc(allWeverPairs[i][0], allWeverPairs[i][1]);
  }
};

export const tag = "dex-pairs-wever";

export const dependencies = [
  "owner-account",
  "token-factory",
  "token-wallets",
  "tokens",
  "dex-root",
];
