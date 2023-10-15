import { Command } from "commander";
import {
  toNano,
  WalletTypes,
  getRandomNonce,
  zeroAddress,
  Address,
} from "locklift";
import { displayTx } from "utils/helpers";
import {
  installAccountCode,
  installPairCode,
  installPoolCode,
  installTokenVaultCode,
} from "../../utils/upgrade.utils";

async function main() {
  const program = new Command();
  program.allowUnknownOption().option("-o, --owner <owner>", "owner");
  program.parse(process.argv);

  const options = program.opts();

  const newOwner = new Address(options.owner);

  // ============ DEPLOYER ACCOUNT ============

  const name = `DexOwner`;

  await locklift.deployments.deployAccounts(
    [
      {
        deploymentName: name,
        accountSettings: {
          type: WalletTypes.EverWallet,
          value: toNano(10),
          nonce: getRandomNonce(),
        },
        signerId: "0",
      },
    ],
    true,
  );

  const account = locklift.deployments.getAccount(name).account;
  const signer = locklift.deployments.getAccount(name).signer;

  await locklift.provider.sendMessage({
    sender: account.address,
    recipient: account.address,
    amount: toNano(1),
    bounce: false,
  });

  console.log(`${name}: ${account.address}`);

  // ============ TOKEN FACTORY ============
  // const TokenFactory = await locklift.factory.getContractArtifacts(
  //   'TokenFactory',
  // );

  const TokenRoot = locklift.factory.getContractArtifacts(
    "TokenRootUpgradeable",
  );
  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  const {
    extTransaction: { contract: tokenFactory },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenFactory",
        constructorParams: {
          _owner: account.address,
        },
        initParams: {
          randomNonce_: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "TokenFactory",
    }),
  );

  console.log(`TokenFactory: ${tokenFactory.address}`);

  console.log(`TokenFactory.setRootCode`);
  await tokenFactory.methods.setRootCode({ _rootCode: TokenRoot.code }).send({
    from: account.address,
    amount: toNano(2),
  });

  console.log(`TokenFactory.setWalletCode`);
  await tokenFactory.methods
    .setWalletCode({ _walletCode: TokenWallet.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  console.log(`TokenFactory.setWalletPlatformCode`);
  await tokenFactory.methods
    .setWalletPlatformCode({ _walletPlatformCode: TokenWalletPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  // ============ ROOT AND VAULT ============
  const DexPlatform = await locklift.factory.getContractArtifacts(
    "DexPlatform",
  );
  const DexAccount = await locklift.factory.getContractArtifacts("DexAccount");
  const DexPair = await locklift.factory.getContractArtifacts("DexPair");
  const DexStablePair = await locklift.factory.getContractArtifacts(
    "DexStablePair",
  );
  const DexStablePool = await locklift.factory.getContractArtifacts(
    "DexStablePool",
  );
  const DexTokenVault = await locklift.factory.getContractArtifacts(
    "DexTokenVault",
  );
  const LpTokenPending = await locklift.factory.getContractArtifacts(
    "LpTokenPending",
  );

  console.log(`Deploying DexGasValues...`);

  const { extTransaction: gasValues } =
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deployConfig: {
          contract: "DexGasValues",
          constructorParams: {
            owner_: account.address,
          },
          initParams: {
            _nonce: getRandomNonce(),
          },
          publicKey: signer.publicKey,
          value: toNano(2),
        },
        deploymentName: "DexGasValues",
      }),
    );
  console.log(`DexGasValues: ${gasValues.contract.address}`);
  displayTx(gasValues.tx.transaction);

  console.log(`Deploying DexRoot...`);
  const {
    extTransaction: { contract: dexRoot },
    extTransaction: dexRootTx,
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexRoot",
        constructorParams: {
          initial_owner: account.address,
          initial_vault: zeroAddress,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexRoot",
    }),
  );

  displayTx(dexRootTx.tx.transaction);
  console.log(`DexRoot address: ${dexRoot.address}`);
  console.log(`DexRoot: installing Platform code...`);

  let tx = await dexRoot.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexAccount code...`);

  tx = await installAccountCode(DexAccount);
  displayTx(tx);

  console.log(`DexRoot: installing DexPair CONSTANT_PRODUCT code...`);

  tx = await installPairCode(DexPair, 1);
  displayTx(tx);

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);

  tx = await installPairCode(DexStablePair, 2);
  displayTx(tx);

  console.log(`DexRoot: installing DexStablePool code...`);

  tx = await installPoolCode(DexStablePool, 3);
  displayTx(tx);

  console.log(`DexRoot: installing VaultLpTokenPendingV2 code...`);

  tx = await dexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: LpTokenPending.code,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log("DexRoot: installing token vault code...");

  tx = await installTokenVaultCode(DexTokenVault);
  displayTx(tx);

  tx = await dexRoot.methods
    .setTokenFactory({
      _newTokenFactory: tokenFactory.address,
      _remainingGasTo: account.address,
    })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`Deploying DexVault...`);

  const {
    extTransaction: { contract: dexVault },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexVault",
        constructorParams: {
          owner_: account.address,
          root_: dexRoot.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexVault",
    }),
  );
  console.log(`DexVault address: ${dexVault.address}`);

  console.log(`DexVault: installing Platform code...`);

  tx = await dexVault.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing vault address...`);

  tx = await dexRoot.methods
    .setVaultOnce({ new_vault: dexVault.address })
    .send({
      from: account.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: set Dex is active...`);

  tx = await dexRoot.methods.setActive({ new_active: true }).send({
    from: account.address,
    amount: toNano(2),
  });
  displayTx(tx);

  if (options.owner) {
    console.log(
      `Transferring DEX ownership from ${account.address} to ${options.owner}`,
    );

    console.log(`Set manager for DexRoot, manager = ${account.address}`);
    let tx = await dexRoot.methods
      .setManager({ _newManager: account.address })
      .send({
        from: account.address,
        amount: toNano(2),
      });
    displayTx(tx);

    console.log(`Transfer for DexRoot: ${dexRoot.address}`);

    tx = await dexRoot.methods
      .transferOwner({
        new_owner: newOwner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    displayTx(tx);

    console.log(`Transfer for DexVault: ${dexRoot.address}`);

    tx = await dexVault.methods
      .transferOwner({
        new_owner: newOwner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    displayTx(tx);

    console.log(`Transfer for TokenFactory: ${dexRoot.address}`);

    tx = await tokenFactory.methods
      .transferOwner({
        answerId: 0,
        newOwner: newOwner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    displayTx(tx);

    console.log(`Transfer for DexGasValues: ${gasValues.contract.address}`);
    tx = await gasValues.contract.methods
      .transferOwner({
        new_owner: newOwner,
      })
      .send({
        from: account.address,
        amount: toNano(1),
      });
    displayTx(tx);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
