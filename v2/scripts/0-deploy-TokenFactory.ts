import { toNano, getRandomNonce } from "locklift";

async function main() {
  const signer = await locklift.keystore.getSigner("0");
  const account = locklift.deployments.getAccount("Account1").account;

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

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
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "DexRoot",
      enableLogs: true,
    }),
  );

  await locklift.deployments.saveContract({
    contractName: "TokenFactory",
    deploymentName: `TokenFactory`,
    address: tokenFactory.address,
  });

  console.log(`TokenFactory: ${tokenFactory.address}`);

  await tokenFactory.methods.setRootCode({ _rootCode: TokenRoot.code }).send({
    from: account.address,
    amount: toNano(2),
  });

  await tokenFactory.methods
    .setWalletCode({ _walletCode: TokenWallet.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });

  await tokenFactory.methods
    .setWalletPlatformCode({ _walletPlatformCode: TokenWalletPlatform.code })
    .send({
      from: account.address,
      amount: toNano(2),
    });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
