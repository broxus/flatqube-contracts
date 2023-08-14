import { toNano, zeroAddress, getRandomNonce } from "locklift";
import BigNumber from "bignumber.js";
import { TOKENS_N, TOKENS_DECIMALS } from "../../utils/consts";

BigNumber.config({ EXPONENTIAL_AT: 257 });

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
              initialSupply: new BigNumber(1).shiftedBy(30).toString(),
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
