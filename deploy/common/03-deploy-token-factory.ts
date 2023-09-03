import { getRandomNonce, toNano } from "locklift";
import { TokenFactoryAbi } from "../../build/factorySource";

export default async () => {
  const signer = await locklift.keystore.getSigner("0");
  const owner = locklift.deployments.getAccount("DexOwner").account;

  const TokenRoot = locklift.factory.getContractArtifacts(
    "TokenRootUpgradeable",
  );
  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenFactory",
        constructorParams: {
          _owner: owner.address,
        },
        initParams: {
          randomNonce_: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "TokenFactory",
      enableLogs: true,
    }),
  );

  const tokenFactory =
    locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");

  await tokenFactory.methods.setRootCode({ _rootCode: TokenRoot.code }).send({
    from: owner.address,
    amount: toNano(2),
  });

  await tokenFactory.methods
    .setWalletCode({ _walletCode: TokenWallet.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });

  await tokenFactory.methods
    .setWalletPlatformCode({ _walletPlatformCode: TokenWalletPlatform.code })
    .send({
      from: owner.address,
      amount: toNano(2),
    });
};

export const tag = "token-factory";

export const dependencies = ["owner-account"];
