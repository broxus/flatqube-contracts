import { toNano, getRandomNonce, zeroAddress } from 'locklift';
import {
  TokenRootUpgradeableAbi,
  TestWeverVaultAbi,
} from '../../build/factorySource';

export default async () => {
  const signer = await locklift.keystore.getSigner('0');
  const weverVault =
    locklift.deployments.getContract<TestWeverVaultAbi>('weverVault');
  const weverRoot =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>('wever');

  console.log(`Deploying EverToTip3 contract...`);

  const { extTransaction: everToTip3 } =
    await locklift.transactions.waitFinalized(
      await locklift.deployments.deploy({
        deployConfig: {
          contract: 'EverToTip3',
          constructorParams: {},
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot,
            weverVault: weverVault,
          },
          publicKey: signer.publicKey,
          value: toNano(2),
        },
        deploymentName: 'EverToTip3',
        enableLogs: true,
      }),
    );
  console.log(
    `EverToTip3 deploing end. Address: ${everToTip3.contract.address}`,
  );

  console.log(`Deploying Tip3ToEver...`);

  const { extTransaction: tip3ToEver } =
    await locklift.transactions.waitFinalized(
      await locklift.deployments.deploy({
        deployConfig: {
          contract: 'Tip3ToEver',
          constructorParams: {},
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot,
            weverVault: weverVault,
          },
          publicKey: signer.publicKey,
          value: toNano(2),
        },
        deploymentName: 'Tip3ToEver',
        enableLogs: true,
      }),
    );
  console.log(
    `Tip3ToEver deploying end. Address: ${tip3ToEver.contract.address}`,
  );

  console.log(`Deploying EverWeverToTip3...`);
  const { extTransaction: everWEverToTIP3 } =
    await locklift.transactions.waitFinalized(
      await locklift.deployments.deploy({
        deployConfig: {
          contract: 'EverWeverToTip3',
          constructorParams: {},
          initParams: {
            randomNonce_: getRandomNonce(),
            weverRoot: weverRoot,
            weverVault: weverVault,
            everToTip3: everToTip3.contract.address,
          },
          publicKey: signer.publicKey,
          value: toNano(2),
        },
        deploymentName: 'EverWeverToTip3',
        enableLogs: true,
      }),
    );
  console.log(
    `EverWeverToTip3 deploing end. Address: ${everWEverToTIP3.contract.address}`,
  );
};

export const tag = 'ever-wever-tip3';

export const dependencies = ['wever'];
