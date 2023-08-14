import { Address } from "locklift";

async function main() {
  await locklift.deployments.saveContract({
    contractName: "TokenRootUpgradeable",
    deploymentName: "WEVERRoot",
    address: new Address(
      "0:a49cd4e158a9a15555e624759e2e4e766d22600b7800d891e46f9291f044a93d",
    ),
  });

  await locklift.deployments.saveContract({
    contractName: "TestWeverVault",
    deploymentName: "WEVERVault",
    address: new Address(
      "0:557957cba74ab1dc544b4081be81f1208ad73997d74ab3b72d95864a41b779a4",
    ),
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
