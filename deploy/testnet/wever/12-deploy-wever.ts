import { getRandomNonce, toNano } from "locklift";

import {
  TestWeverVaultAbi,
  TokenRootUpgradeableAbi,
} from "build/factorySource";

export default async () => {
  await locklift.deployments.load();
  console.log("deploying testnet WEVER");
  const weverOwner = locklift.deployments.getAccount("DexOwner");

  await locklift.deployments.saveContract({
    deploymentName: "weverRoot",
    address:
      "0:a49cd4e158a9a15555e624759e2e4e766d22600b7800d891e46f9291f044a93d",
    contractName: "TokenRootUpgradeable",
  });

  await locklift.deployments.saveContract({
    deploymentName: "wever",
    address:
      "0:557957cba74ab1dc544b4081be81f1208ad73997d74ab3b72d95864a41b779a4",
    contractName: "TestWeverVault",
  });

  const root =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("weverRoot");
  const weverVault =
    locklift.deployments.getContract<TestWeverVaultAbi>("weverVault");

  console.log(`root address: ${root.address}`);

  console.log(`weverVault address: ${weverVault.address}`);

  // - Deploy user token wallet
  await root.methods
    .deployWallet({
      walletOwner: weverOwner.account.address,
      deployWalletValue: toNano(2),
      answerId: 0,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(5),
    });

  // Tunnel
  // - Deploy tunnel
  const { contract: tunnel } = await locklift.factory.deployContract({
    contract: "TestWeverTunnel",
    publicKey: weverOwner.signer.publicKey,
    value: toNano(2),
    initParams: {
      _randomNonce: getRandomNonce(),
    },
    constructorParams: {
      sources: [],
      destinations: [],
      owner_: weverOwner.account.address,
    },
  });

  console.log(`tunnel address: ${tunnel.address}`);

  const { extTransaction: everToTip3 } =
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deploymentName: "EverToTip3",
        deployConfig: {
          contract: "EverToTip3",
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: root.address,
            weverVault: weverVault.address,
          },
          constructorParams: {},
          value: toNano(2),
          publicKey: weverOwner.signer.publicKey,
        },
      }),
    );

  const { extTransaction: everWeverToTip3 } =
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deploymentName: "EverWeverToTip3",
        deployConfig: {
          contract: "EverWeverToTip3",
          constructorParams: {},
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: root.address,
            weverVault: weverVault.address,
            everToTip3: everToTip3.contract.address,
          },
          value: toNano(2),
          publicKey: weverOwner.signer.publicKey,
        },
      }),
    );

  console.log(`everWeverToTip3 address: ${everWeverToTip3.contract.address}`);
  // Proxy token transfer
  // - Deploy proxy token transfer
  //
  // const { contract: proxyTokenTransfer } =
  //   await locklift.transactions.waitFinalized(
  //     locklift.factory.deployContract({
  //       contract: 'WeverProxyTokenTransfer',
  //       constructorParams: {
  //         owner_: weverOwner.account.address,
  //       },
  //       initParams: {
  //         _randomNonce: getRandomNonce(),
  //       },
  //       publicKey: weverOwner.signer.publicKey,
  //       value: toNano(2),
  //     }),
  //   );
  //
  // // - Set configuration (use user as ethereum configuration to emulate callbacks)
  //
  // await proxyTokenTransfer.methods
  //   .setConfiguration({
  //     _config: {
  //       tonConfiguration: weverOwner.account.address,
  //       ethereumConfigurations: [weverOwner.account.address],
  //       root: root.address,
  //       settingsDeployWalletGrams: toNano(0.5),
  //       settingsTransferGrams: toNano(0.5),
  //     },
  //   })
  //   .send({
  //     from: weverOwner.account.address,
  //     amount: toNano(3),
  //   });
  //
  // // - Setup proxy token transfer token wallet
  // const proxyTokenWalletAddress = await proxyTokenTransfer.methods
  //   .token_wallet()
  //   .call()
  //   .then((res) => res.token_wallet);
  //
  // const proxyTokenWallet = await locklift.factory.getDeployedContract(
  //   'TokenWalletUpgradeable',
  //   proxyTokenWalletAddress,
  // );

  await root.methods
    .transferOwnership({
      newOwner: tunnel.address,
      remainingGasTo: weverOwner.account.address,
      callbacks: [],
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(2),
    });

  // - Add vault to tunnel sources
  await tunnel.methods
    .__updateTunnel({
      source: weverVault.address,
      destination: root.address,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(2),
    });

  // - Drain vault
  await weverVault.methods
    .drain({
      receiver: weverOwner.account.address,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(2),
    });

  await weverVault.methods
    .grant({
      amount: toNano(4),
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(6),
    });

  console.log(`wever contracts deployed!`);
};

export const tag = "wever";
