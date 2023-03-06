import { Migration } from '../utils/migration';
import {toNano, getRandomNonce} from "locklift";

async function main() {
  const migration = new Migration();

  const signer = await locklift.keystore.getSigner('0');
  const account = await migration.loadAccount('Account1', '0');

  if (locklift.tracing) {
    locklift.tracing.setAllowedCodesForAddress(account.address, {compute: [100]});
  }

  const TokenRoot = await locklift.factory.getContractArtifacts('TokenRootUpgradeable');
  const TokenWallet = await locklift.factory.getContractArtifacts('TokenWalletUpgradeable');
  const TokenWalletPlatform = await locklift.factory.getContractArtifacts('TokenWalletPlatform');

  const {contract: tokenFactory} = await locklift.factory.deployContract({
    contract: 'TokenFactory',
    constructorParams: {
      _owner: account.address
    },
    initParams: {
      randomNonce_: getRandomNonce(),
    },
    publicKey: signer!.publicKey,
    value: toNano(2),
  });
  migration.store(tokenFactory, 'TokenFactory');

  console.log(`TokenFactory: ${tokenFactory.address}`);

  await tokenFactory.methods.setRootCode({_rootCode: TokenRoot.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  await tokenFactory.methods.setWalletCode({_walletCode: TokenWallet.code}).send({
    from: account.address,
    amount: toNano(2)
  });

  await tokenFactory.methods.setWalletPlatformCode({_walletPlatformCode: TokenWalletPlatform.code}).send({
    from: account.address,
    amount: toNano(2)
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
