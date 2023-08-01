import { toNano, zeroAddress } from 'locklift';
export const TOKENS_N = 5;

export default async () => {
  const signer = await locklift.keystore.getSigner('0');
  const owner = locklift.deployments.getAccount('DexOwner').account;
  const walletArtifacts = locklift.factory.getContractArtifacts(
    'TokenWalletUpgradeable',
  );
  const platformArtifacts = locklift.factory.getContractArtifacts(
    'TokenWalletPlatform',
  );

  for (let i = 0; i < TOKENS_N; i++) {
    await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deployConfig: {
          contract: 'TokenRootUpgradeable',
          publicKey: signer.publicKey,
          initParams: {
            randomNonce_: locklift.utils.getRandomNonce(),
            deployer_: zeroAddress,
            name_: `TST-${i}`,
            symbol_: `TST-${i}`,
            decimals_: 9,
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
        deploymentName: `token-${i}`,
        enableLogs: true,
      }),
    );
  }
};

export const tag = 'tokens';
export const dependencies = ['owner-account'];
