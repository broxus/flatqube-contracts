import { Address } from "locklift";

// FlatQube
const DEX_ROOT_ADDRESS =
  "0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008";
const DEX_VAULT_ADDRESS =
  "0:6fa537fa97adf43db0206b5bec98eb43474a9836c016a190ac8b792feb852230";

// venom testnet
// const DEX_ROOT_ADDRESS =
//   '0:ca623638d147c9bbb202cc13979d7b1501c39299849776045a32786b78c48e35';
// const DEX_VAULT_ADDRESS =
//   '0:77281f01c6ebeba6b6e479ae586e293866071f58896e99a25ff58518136aa13d';

async function main() {
  const dexRoot = locklift.factory.getDeployedContract(
    "DexRoot",
    new Address(DEX_ROOT_ADDRESS),
  );
  const dexRootPrev = locklift.factory.getDeployedContract(
    "DexRootPrev",
    new Address(DEX_ROOT_ADDRESS),
  );
  const dexVault = locklift.factory.getDeployedContract(
    "DexVault",
    new Address(DEX_VAULT_ADDRESS),
  );
  const dexVaultPrev = locklift.factory.getDeployedContract(
    "DexVaultPrev",
    new Address(DEX_VAULT_ADDRESS),
  );

  migration.store(dexRoot, "DexRoot");
  migration.store(dexRootPrev, "DexRootPrev");
  migration.store(dexVault, "DexVault");
  migration.store(dexVaultPrev, "DexVaultPrev");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
