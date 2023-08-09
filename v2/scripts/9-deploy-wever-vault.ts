import logger from 'mocha-logger-ts';
import { fromNano, getRandomNonce, toNano, zeroAddress } from 'locklift';
import { Command } from 'commander';

import { Constants, Migration } from '../utils/migration';

const program = new Command();

program
  .allowUnknownOption()
  .option('-wa, --wrap-amount <wrapAmount>', 'wrap amount');

program.parse(process.argv);

const main = async () => {
  const options = program.opts();
  const migration = new Migration();
  const signer = await locklift.keystore.getSigner('1');
  const owner = await migration.loadAccount('Account2', '1');
  const tokenData = Constants.tokens['wever'];

  const vaultTokenWalletCode = locklift.factory.getContractArtifacts(
    'VaultTokenWallet_V1',
  ).code;
  const tokenWalletPlatformCode = locklift.factory.getContractArtifacts(
    'TokenWalletPlatform',
  ).code;

  logger.log(`Owner: ${owner.address}`);
  logger.log(`Deploying VaultTokenRoot_V1 for ${tokenData.symbol}`);

  const { contract } = await locklift.factory.deployContract({
    contract: 'VaultTokenRoot_V1',
    constructorParams: {},
    initParams: {
      name_: tokenData.name,
      symbol_: tokenData.symbol,
      decimals_: tokenData.decimals,
      rootOwner_: owner.address,
      deployer_: zeroAddress,
      randomNonce_: getRandomNonce(),
      walletCode_: vaultTokenWalletCode,
      platformCode_: tokenWalletPlatformCode,
    },
    value: toNano(2),
    publicKey: signer.publicKey,
  });

  logger.success(
    `VaultTokenRoot_V1 for ${tokenData.symbol} was deployed: ${contract.address}`,
  );

  migration.store(contract, `${tokenData.symbol}Root`);

  logger.log(`Draining surplus gas from ${contract.address}`);

  await locklift.transactions.waitFinalized(
    contract.methods
      .sendSurplusGas({ to: owner.address })
      .send({ from: owner.address, amount: toNano(0.1) }),
  );

  logger.log(`Wrap ${options.wrapAmount} ${tokenData.symbol}`);

  await locklift.transactions.waitFinalized(
    contract.methods
      .wrap({
        payload: '',
        deployWalletValue: toNano(0.1),
        remainingGasTo: owner.address,
        notify: false,
        recipient: owner.address,
        tokens: toNano(options.wrapAmount),
      })
      .send({
        from: owner.address,
        amount: toNano(+options.wrapAmount + 1),
      }),
  );

  const wallet = await contract.methods
    .walletOf({ answerId: 0, walletOwner: owner.address })
    .call()
    .then((r) =>
      locklift.factory.getDeployedContract('VaultTokenWallet_V1', r.value0),
    );

  migration.store(wallet, tokenData.symbol + 'Wallet2');

  const balance = await wallet.methods
    .balance({ answerId: 0 })
    .call()
    .then((r) => r.value0);

  logger.success(
    `${tokenData.symbol} balance of ${owner.address}: ${fromNano(balance)}`,
  );
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
