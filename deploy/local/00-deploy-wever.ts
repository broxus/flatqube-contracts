import { fromNano, getRandomNonce, toNano, zeroAddress } from "locklift";
import logger from "mocha-logger-ts";
import { getWallet } from "../../utils/wrappers";

export default async () => {
  const owner = await locklift.deployments.getAccount("DexOwner");
  const account = owner.account;

  const vaultTokenWalletCode = locklift.factory.getContractArtifacts(
    "VaultTokenWallet_V1",
  ).code;
  const tokenWalletPlatformCode = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  ).code;

  const { contract } = await locklift.deployments.deploy({
    deployConfig: {
      contract: "VaultTokenRoot_V1",
      constructorParams: {},
      initParams: {
        name_: "Wrapped EVER",
        symbol_: "WEVER",
        decimals_: 9,
        rootOwner_: account.address,
        deployer_: zeroAddress,
        randomNonce_: getRandomNonce(),
        walletCode_: vaultTokenWalletCode,
        platformCode_: tokenWalletPlatformCode,
      },
      value: toNano(2),
      publicKey: owner.signer.publicKey,
    },
    deploymentName: "token-wever",
    enableLogs: true,
  });

  logger.log(`Draining surplus gas from ${contract.address}`);

  await locklift.transactions.waitFinalized(
    contract.methods
      .sendSurplusGas({ to: account.address })
      .send({ from: account.address, amount: toNano(0.1) }),
  );

  const wrapAmount = 1500;

  logger.log(`Wrap ${wrapAmount} ever`);

  await locklift.transactions.waitFinalized(
    contract.methods
      .wrap({
        payload: "",
        deployWalletValue: toNano(0.1),
        remainingGasTo: account.address,
        notify: false,
        recipient: account.address,
        tokens: toNano(wrapAmount),
      })
      .send({
        from: account.address,
        amount: toNano(wrapAmount + 1),
      }),
  );

  const wallet = await getWallet(account.address, contract.address).then(
    a => a.walletContract,
  );

  const balance = await wallet.methods
    .balance({ answerId: 0 })
    .call()
    .then(r => r.value0);

  logger.success(`wever balance of ${account.address}: ${fromNano(balance)}`);
};

export const tag = "wever";

export const dependencies = ["owner-account"];
