import { toNano, zeroAddress, getRandomNonce } from "locklift";
export const TOKENS_N = 2;
export const TOKENS_DECIMALS = [6, 9, 18];

export default async () => {
  const signer = await locklift.keystore.getSigner("0");
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const walletArtifacts = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const platformArtifacts = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  for (let i = 0; i < TOKENS_DECIMALS.length; i++) {
    for (let k = 0; k < TOKENS_N; k++) {
      await locklift.transactions.waitFinalized(
        locklift.deployments.deploy({
          deployConfig: {
            contract: "TokenRootUpgradeable",
            publicKey: signer.publicKey,
            initParams: {
              randomNonce_: getRandomNonce(),
              deployer_: zeroAddress,
              name_: `TST-${TOKENS_DECIMALS[i]}-${k}`,
              symbol_: `TST-${TOKENS_DECIMALS[i]}-${k}`,
              decimals_: TOKENS_DECIMALS[i],
              walletCode_: walletArtifacts.code,
              rootOwner_: owner.address,
              platformCode_: platformArtifacts.code,
            },
            constructorParams: {
              initialSupplyTo: owner.address,
              initialSupply: 10 ** 18,
              deployWalletValue: toNano(0.5),
              mintDisabled: false,
              burnByRootDisabled: true,
              burnPaused: true,
              remainingGasTo: owner.address,
            },
            value: toNano(10),
          },
          deploymentName: `token-${TOKENS_DECIMALS[i]}-${k}`,
          enableLogs: true,
        }),
      );
    }
  }
};

export const tag = "tokens";
export const dependencies = ["owner-account"];
