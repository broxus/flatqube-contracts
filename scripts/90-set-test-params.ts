import {
  DexRootAbi,
  DexVaultAbi,
  TokenRootUpgradeableAbi,
} from "../build/factorySource";
import { Address, toNano } from "locklift";
import {
  setPairFeeParams,
  setReferralProgramParams,
} from "../utils/wrappers";

const MANAGER = new Address(
  "0:33478651d9c7b44c1b45c2dfe85edf7a5d24692f5222f0a25c176b1abfd95e51",
);

async function main() {
  await locklift.deployments.load();
  const owner = locklift.deployments.getAccount("DexOwner").account;

  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
  const foo =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-Foo");
  const bar =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-Bar");
  const qwe =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-Qwe");
  const tst =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>("token-Tst");

  console.log(`DexRoot.setManager(${MANAGER})`);
  await dexRoot.methods.setManager({ _newManager: MANAGER }).send({
    from: owner.address,
    amount: toNano(1),
  });

  console.log(`DexVault.setManager(${MANAGER})`);
  await dexVault.methods.setManager({ _newManager: MANAGER }).send({
    from: owner.address,
    amount: toNano(1),
  });

  console.log(`DexVault.setReferralProgramParams`);
  await setReferralProgramParams(
    "0",
    new Address(
      "0:1cf8f1dee31e3c74888d1adac9a013ed4bfe1ddf5b431e0c5b1d4e1dd5192217",
    ),
    new Address(
      "0:a642ad3ab35551f8a45b12984611bf90b6a884a50b2dd8d9e0fc306b278e1cc6",
    ),
  );

  console.log(`Set fee params`);
  await setPairFeeParams([foo.address, bar.address, qwe.address], {
    beneficiary: MANAGER,
    beneficiary_numerator: 500,
    denominator: 1000000,
    pool_numerator: 0,
    referrer_numerator: 0,
    referrer_threshold: [
      [foo.address, 0],
      [bar.address, 0],
      [qwe.address, 0],
    ],
    threshold: [
      [foo.address, 1000000],
      [bar.address, 1000000],
      [qwe.address, 0],
    ],
  });

  await setPairFeeParams([foo.address, tst.address], {
    beneficiary: MANAGER,
    beneficiary_numerator: 2500,
    denominator: 1000000,
    pool_numerator: 2500,
    referrer_numerator: 0,
    referrer_threshold: [
      [foo.address, 0],
      [tst.address, 0],
    ],
    threshold: [
      [foo.address, 1000000],
      [tst.address, 1000000],
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
