import { getRandomNonce, toNano, zeroAddress } from "locklift";
import {
  DexVaultAbi,
  DexRootAbi,
  TokenFactoryAbi,
} from "../../build/factorySource";
import {
  installAccountCode,
  installPairCode,
  installPoolCode,
  installTokenVaultCode,
} from "../../utils/upgrade.utils";

export default async () => {
  const account = locklift.deployments.getAccount("DexOwner");
  const owner = account.account;
  const tokenFactory =
    locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");

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
        publicKey: account.signer.publicKey,
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
        publicKey: account.signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexVault",
      enableLogs: true,
    }),
  );

  const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

  let tx = await dexVault.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  tx = await dexRoot.methods
    .setVaultOnce({ new_vault: dexVault.address })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  tx = await installTokenVaultCode(DexTokenVault);

  tx = await dexRoot.methods
    .installOrUpdateLpTokenPendingCode({
      _newCode: LpTokenPending.code,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  tx = await dexRoot.methods
    .setTokenFactory({
      _newTokenFactory: tokenFactory.address,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  tx = await dexRoot.methods
    .installPlatformOnce({ code: DexPlatform.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  tx = await installAccountCode(DexAccount);

  tx = await installPairCode(DexPair, 1);

  tx = await installPairCode(DexStablePair, 2);

  tx = await installPoolCode(DexStablePool, 3);

  tx = await dexRoot.methods.setActive({ new_active: true }).send({
    from: owner.address,
    amount: toNano(2),
  });
};

export const tag = "dex-root";

export const dependencies = [
  "owner-account",
  "token-factory",
];
