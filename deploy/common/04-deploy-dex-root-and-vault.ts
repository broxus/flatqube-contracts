import { getRandomNonce, toNano, zeroAddress } from "locklift";
import { DexVaultAbi, DexRootAbi } from "../../build/factorySource";
import { displayTx } from "../../v2/utils/migration";

export default async () => {
  locklift.tracing.setAllowedCodes({ compute: [60] });
  const signer = await locklift.keystore.getSigner("0");
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const tokenFactory =
    locklift.deployments.getContract<DexRootAbi>("TokenFactory");

  locklift.tracing.setAllowedCodesForAddress(owner.address, {
    compute: [100],
  });

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
  const LpTokenPending = await locklift.factory.getContractArtifacts(
    "LpTokenPending",
  );
  const DexTokenVault = await locklift.factory.getContractArtifacts(
    "DexTokenVault",
  );

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexRoot",
        constructorParams: {
          initial_owner: owner.address,
          initial_vault: zeroAddress,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexRoot",
      enableLogs: true,
    }),
  );

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "DexVault",
        constructorParams: {
          owner_: owner.address,
          root_: dexRoot.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexVault",
      enableLogs: true,
    }),
  );

  const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

  console.log(`DexVault address: ${dexVault.address}`);

  console.log(`DexVault: installing Platform code...`);
  let tx = await dexVault.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing vault address...`);
  tx = await dexRoot.methods
    .setVaultOnce({ new_vault: dexVault.address })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log("DexRoot: installing vault code...");
  tx = await dexRoot.methods
    .installOrUpdateTokenVaultCode({
      _newCode: DexTokenVault.code,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log("DexRoot: installing lp pending code...");
  tx = await dexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: LpTokenPending.code,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log("DexRoot: set Token Factory...");
  tx = await dexRoot.methods
    .setTokenFactory({
      _newTokenFactory: tokenFactory.address,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing Platform code...`);
  tx = await dexRoot.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexAccount code...`);
  tx = await dexRoot.methods
    .installOrUpdateAccountCode({ code: DexAccount.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair CONSTANT_PRODUCT code...`);
  tx = await dexRoot.methods
    .installOrUpdatePairCode({ code: DexPair.code, pool_type: 1 })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexStablePool code...`);
  tx = await dexRoot.methods
    .installOrUpdatePoolCode({ code: DexStablePool.code, pool_type: 3 })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: installing DexPair STABLESWAP code...`);
  tx = await dexRoot.methods
    .installOrUpdatePairCode({ code: DexStablePair.code, pool_type: 2 })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
  displayTx(tx);

  console.log(`DexRoot: set Dex is active...`);
  tx = await dexRoot.methods.setActive({ new_active: true }).send({
    from: owner.address,
    amount: toNano(2),
  });
  displayTx(tx);
};

export const tag = "dex-root";

export const dependencies = ["owner-account", "token-factory"];
