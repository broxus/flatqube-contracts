import { Address } from "locklift/everscale-provider";

export default async () => {
  const WRAPPED_NATIVE_ROOT = new Address(
    "0:4be0909d6ce0368521e99be3b748026f923e1576696e88429afe05395104e440",
  );

  const weverRoot = locklift.factory.getDeployedContract(
    "VaultTokenRoot_V1",
    WRAPPED_NATIVE_ROOT,
  );

  await locklift.deployments.saveContract({
    deploymentName: "token-wever",
    address: weverRoot.address,
    contractName: "VaultTokenRoot_V1",
  });
};

export const tag = "wever";
export const dependencies: string[] = [];
