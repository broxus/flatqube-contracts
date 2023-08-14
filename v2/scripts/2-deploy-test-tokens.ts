import { toNano, zeroAddress, getRandomNonce } from "locklift";
import { Constants, TTokenName } from "../../utils/consts";
import { Command } from "commander";

const program = new Command();

async function main() {
  const signer = await locklift.keystore.getSigner("0");
  const account = locklift.deployments.getAccount("Account1").account;
  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {
      compute: [100],
    });
  }

  // ex: --tokens='["qwa"]'
  program
    .allowUnknownOption()
    .option("-t, --tokens <tokens>", "tokens to deploy");

  program.parse(process.argv);

  const options = program.opts();

  const tokens: TTokenName[] = options.tokens
    ? JSON.parse(options.tokens)
    : ["foo", "bar", "tst"];

  const TokenWalletUpgradeable = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );
  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );

  for (const tokenId of tokens) {
    const tokenData = Constants.tokens[tokenId] ?? {
      name: tokenId,
      symbol: tokenId,
      decimals: 6,
      upgradeable: true,
    };

    const {
      extTransaction: { contract: tokenRoot },
    } = await locklift.transactions.waitFinalized(
      locklift.deployments.deploy({
        deployConfig: {
          contract: tokenData.upgradeable
            ? "TokenRootUpgradeable"
            : "TokenRoot",
          constructorParams: {
            initialSupplyTo: zeroAddress,
            initialSupply: "0",
            deployWalletValue: "0",
            mintDisabled: false,
            burnByRootDisabled: true,
            burnPaused: true,
            remainingGasTo: zeroAddress,
          },
          initParams: {
            randomNonce_: getRandomNonce(),
            deployer_: zeroAddress,
            name_: tokenData.name,
            symbol_: tokenData.symbol,
            decimals_: tokenData.decimals,
            walletCode_: tokenData.upgradeable
              ? TokenWalletUpgradeable.code
              : TokenWallet.code,
            rootOwner_: account.address,
            platformCode_: tokenData.upgradeable
              ? TokenWalletPlatform.code
              : undefined,
          },
          publicKey: signer.publicKey,
          value: toNano(3),
        },
        deploymentName: `${tokenData.symbol}Root`,
      }),
    );

    console.log(`Token ${tokenData.name}: ${tokenRoot.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
