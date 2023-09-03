import logger from "mocha-logger-ts";
import { toNano } from "locklift";

import { Constants, Migration } from "../../utils/oldUtils/migration";

const main = async () => {
  const migration = new Migration();
  const owner = await migration.loadAccount("Account1", "0");
  const tokenData = Constants.tokens["wever"];
  const weverVault = migration.loadContract(
    "VaultTokenRoot_V1",
    `${tokenData.symbol}Root`,
  );
  const dexRoot = migration.loadContract("DexRoot", "DexRoot");

  const tokenVault = await dexRoot.methods
    .getExpectedTokenVaultAddress({
      answerId: 0,
      _tokenRoot: weverVault.address,
    })
    .call()
    .then(r => r.value0);

  logger.log(
    `Setting ${weverVault.address} as WEVER Vault in TokenVault ${tokenVault}`,
  );

  await locklift.tracing.trace(
    dexRoot.methods
      .setWeverInDexTokenVault({
        _dexTokenVault: tokenVault,
        _newWeverVaultTokenRoot: weverVault.address,
        _remainingGasTo: owner.address,
      })
      .send({ from: owner.address, amount: toNano(0.5) }),
  );

  logger.success(`Set ${weverVault.address} as WEVER Vault`);
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
