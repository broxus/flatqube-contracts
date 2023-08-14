import { displayTx } from "../../utils/helpers";
import { Constants } from "../../utils/consts";
import { toNano, zeroAddress, getRandomNonce } from "locklift";
import { Command } from "commander";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logger = require("mocha-logger");

import { BigNumber } from "bignumber.js";

BigNumber.config({ EXPONENTIAL_AT: 257 });

const program = new Command();

let tx;

async function main() {
  program
    .allowUnknownOption()
    .option("-wa, --wrap_amount <wrap_amount>", "wrap amount");

  program.parse(process.argv);

  const options = program.opts();
  options.wrap_amount = options.wrap_amount || "60";

  const tokenData = Constants.tokens["wever"];

  const signer = await locklift.keystore.getSigner("1");
  const Account2 = locklift.deployments.getAccount("Account2").account;

  logger.success(`Owner: ${Account2.address}`);

  logger.log(`Deploying tunnel`);

  const {
    extTransaction: { contract: tunnel },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TestWeverTunnel",
        constructorParams: {
          sources: [],
          destinations: [],
          owner_: Account2.address,
        },
        initParams: {
          _nonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(5),
      },
      deploymentName: `${tokenData.symbol}Tunnel`,
    }),
  );

  logger.success(`Tunnel address: ${tunnel.address}`);

  logger.log(`Deploying WEVER`);

  const TokenWallet = await locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );

  const TokenWalletPlatform = await locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  const {
    extTransaction: { contract: root },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenRootUpgradeable",
        constructorParams: {
          initialSupplyTo: zeroAddress,
          initialSupply: "0",
          deployWalletValue: "0",
          mintDisabled: false,
          burnByRootDisabled: false,
          burnPaused: false,
          remainingGasTo: zeroAddress,
        },
        initParams: {
          randomNonce_: getRandomNonce(),
          deployer_: zeroAddress,
          name_: tokenData.name,
          symbol_: tokenData.symbol,
          decimals_: tokenData.decimals,
          walletCode_: TokenWallet.code,
          rootOwner_: tunnel.address,
          platformCode_: TokenWalletPlatform.code,
        },
        publicKey: signer.publicKey,
        value: toNano(3),
      },
      deploymentName: `${tokenData.symbol}Root`,
    }),
  );

  logger.success(`WEVER root: ${root.address}`);

  logger.log(`Deploying vault`);

  const {
    extTransaction: { contract: vault },
  } = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TestWeverVault",
        constructorParams: {
          owner_: Account2.address,
          root_tunnel: tunnel.address,
          root: root.address,
          receive_safe_fee: toNano(1),
          settings_deploy_wallet_grams: toNano(0.1),
          initial_balance: toNano(1),
        },
        initParams: {
          _randomNonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(3),
      },
      deploymentName: `${tokenData.symbol}Vault`,
    }),
  );

  logger.success(`Vault address: ${vault.address}`);

  logger.log(`Adding tunnel (vault, root)`);

  tx = await tunnel.methods
    .__updateTunnel({
      source: vault.address,
      destination: root.address,
    })
    .send({
      from: Account2.address,
      amount: toNano(2),
    });

  displayTx(tx);

  logger.log(`Draining vault`);

  tx = await vault.methods
    .drain({
      receiver: Account2.address,
    })
    .send({
      from: Account2.address,
      amount: toNano(2),
    });

  displayTx(tx);

  logger.log(`Wrap ${options.wrap_amount} EVER`);

  await locklift.transactions.waitFinalized(
    locklift.provider.sendMessage({
      sender: Account2.address,
      recipient: vault.address,
      amount: toNano(options.wrap_amount),
      bounce: false,
    }),
  );

  const tokenWalletAddress = (
    await root.methods
      .walletOf({ answerId: 0, walletOwner: Account2.address })
      .call()
  ).value0;

  const tokenWallet = await locklift.factory.getDeployedContract(
    "TokenWalletUpgradeable",
    tokenWalletAddress,
  );
  await locklift.deployments.saveContract({
    contractName: "TokenWalletUpgradeable",
    deploymentName: tokenData.symbol + "Wallet2",
    address: tokenWallet.address,
  });

  const balance = new BigNumber(
    (await tokenWallet.methods.balance({ answerId: 0 }).call()).value0,
  )
    .shiftedBy(-9)
    .toString();
  logger.log(`Account2 WEVER balance: ${balance}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
