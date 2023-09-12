import { Address } from "locklift/everscale-provider";

export default async () => {
  const WRAPPED_NATIVE_ROOT = new Address(
    "0:5fc1c3c6ed83f5752f5029ac2b2bb64e77bef307c967f997895eaf516331ee11",
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
