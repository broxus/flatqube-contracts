import logger from "mocha-logger-ts";
import { VaultTokenRoot_V1Abi } from "../build/factorySource";
import { setWeverInDexTokenVault } from "../utils/wrappers";
import { displayTx } from "../utils/helpers";

const main = async () => {
  const weverRoot =
    locklift.deployments.getContract<VaultTokenRoot_V1Abi>("token-wever");

  const tx = await setWeverInDexTokenVault(weverRoot.address);
  displayTx(tx);

  logger.success(`Set ${weverRoot.address} as WEVER Vault`);
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
