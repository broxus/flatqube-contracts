import {
  TestWeverVaultAbi,
  TokenRootUpgradeableAbi,
} from "build/factorySource";
import { toNano, getRandomNonce } from "locklift";

async function main() {
  const signer = await locklift.keystore.getSigner("0");

  const weverRoot =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      "WEVERRoot",
    ).address;
  const weverVault =
    locklift.deployments.getContract<TestWeverVaultAbi>("WEVERRoot").address;

  console.log(`Deploying EverToTip3 contract...`);
  const {
    extTransaction: { contract: everToTip3 },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "EverToTip3",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot,
          weverVault: weverVault,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "EverToTip3",
    }),
  );

  console.log(`EverToTip3 deploing end. Address: ${everToTip3.address}`);
  console.log(`Deploying Tip3ToEver...`);

  const {
    extTransaction: { contract: tip3ToEver },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "Tip3ToEver",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot,
          weverVault: weverVault,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "Tip3ToEver",
    }),
  );

  console.log(`Tip3ToEver deploying end. Address: ${tip3ToEver.address}`);

  console.log(`Deploying EverWeverToTip3...`);
  const {
    extTransaction: { contract: everWEverToTIP3 },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "EverWeverToTip3",
        constructorParams: {},
        initParams: {
          randomNonce_: getRandomNonce(),
          weverRoot: weverRoot,
          weverVault: weverVault,
          everToTip3: everToTip3.address,
        },
        publicKey: signer.publicKey,
        value: toNano(2),
      },
      deploymentName: "EverWeverToTip3",
    }),
  );
  console.log(
    `EverWeverToTip3 deploing end. Address: ${everWEverToTIP3.address}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
