import { getRandomNonce, toNano, zeroAddress } from "locklift";

export default async () => {
  await locklift.deployments.load();
  const weverOwner = locklift.deployments.getAccount("DexOwner");

  const { code: tokenWalletCode } = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const { code: tokenWalletPlatformCode } =
    locklift.factory.getContractArtifacts("TokenWalletPlatform");

  const { extTransaction: root } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenRootUpgradeable",
        constructorParams: {
          initialSupplyTo: weverOwner.account.address,
          initialSupply: 0,
          deployWalletValue: toNano(0.1),
          mintDisabled: false,
          burnByRootDisabled: true,
          burnPaused: false,
          remainingGasTo: zeroAddress,
        },
        initParams: {
          deployer_: zeroAddress,
          randomNonce_: getRandomNonce(),
          rootOwner_: weverOwner.account.address,
          name_: "Wrapped EVER",
          symbol_: "WEVER",
          decimals_: 9,
          walletCode_: tokenWalletCode,
          platformCode_: tokenWalletPlatformCode,
        },
        value: toNano(10),
        publicKey: weverOwner.signer.publicKey,
      },
      deploymentName: "wever",
      enableLogs: true,
    }),
  );

  // - Deploy user token wallet
  await root.contract.methods
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

  // Vault
  // - Deploy vault
  const { extTransaction: weverVault } =
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deploymentName: "weverVault",
        deployConfig: {
          contract: "TestWeverVault",
          constructorParams: {
            owner_: weverOwner.account.address,
            root_tunnel: tunnel.address,
            root: root.contract.address,
            receive_safe_fee: toNano(1),
            settings_deploy_wallet_grams: toNano(0.05),
            initial_balance: toNano(1),
          },
          value: toNano(2),
          initParams: {
            _randomNonce: getRandomNonce(),
          },
          publicKey: weverOwner.signer.publicKey,
        },
        enableLogs: true,
      }),
    );

  const { extTransaction: everToTip3 } =
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deploymentName: "EverToTip3",
        deployConfig: {
          contract: "EverToTip3",
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: root.contract.address,
            weverVault: weverVault.contract.address,
          },
          constructorParams: {},
          value: toNano(2),
          publicKey: weverOwner.signer.publicKey,
        },
        enableLogs: true,
      }),
    );

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deploymentName: "EverWeverToTip3",
      deployConfig: {
        contract: "EverWeverToTip3",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: root.contract.address,
          weverVault: weverVault.contract.address,
          everToTip3: everToTip3.contract.address,
        },
        value: toNano(2),
        publicKey: weverOwner.signer.publicKey,
      },
      enableLogs: true,
    }),
  );

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deploymentName: "Tip3ToEver",
      deployConfig: {
        contract: "Tip3ToEver",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: root.contract.address,
          weverVault: weverVault.contract.address,
        },
        value: toNano(2),
        publicKey: weverOwner.signer.publicKey,
      },
      enableLogs: true,
    }),
  );

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

  await root.contract.methods
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
      source: weverVault.contract.address,
      destination: root.contract.address,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(2),
    });

  // - Drain vault
  await weverVault.contract.methods
    .drain({
      receiver: weverOwner.account.address,
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(2),
    });

  await weverVault.contract.methods
    .grant({
      amount: toNano(4),
    })
    .send({
      from: weverOwner.account.address,
      amount: toNano(6),
    });
};

export const tag = "wever";
