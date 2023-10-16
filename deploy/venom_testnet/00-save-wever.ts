import { Address } from "locklift/everscale-provider";

export default async () => {
  const WRAPPED_NATIVE_ROOT = new Address(
    "0:fb7fcb1f07a2f581b9312feb23bc2d4e442e73af432e79c2daf9d37f31c313c4",
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
