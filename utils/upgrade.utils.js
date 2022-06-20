const logger = require('mocha-logger');

/**
 * Upgrades DEX pair's code
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param leftRoot TokenRoot contract of the left pair's token with address
 * @param rightRoot TokenRoot contract of the right pair's token with address
 * @param newPair a new DexPair contract
 */
const upgradePair = async (
  account,
  dexRoot,
  leftRoot,
  rightRoot,
  newPair,
) => {
  logger.log('[DexRoot] installOrUpdatePairCode...');
  await account.runTarget({
    contract: dexRoot,
    method: 'installOrUpdatePairCode',
    params: { code: newPair.code, pool_type: 1 },
    value: locklift.utils.convertCrystal(10, 'nano'),
    keyPair: account.keyPair,
  });

  logger.log('[DexRoot] upgradePair...');
  const tx = await account.runTarget({
    contract: dexRoot,
    method: 'upgradePair',
    params: {
      left_root: leftRoot,
      right_root: rightRoot,
      send_gas_to: account.address,
      pool_type: 1,
    },
    value: locklift.utils.convertCrystal(10, 'nano'),
    keyPair: account.keyPair,
  });

  logger.success(`Pair is upgraded: ${tx.id}`);
};

/**
 * Upgrades DEX root's code
 * @param account account to pay gas
 * @param dexRoot DexRoot contract with address
 * @param newRoot a new DexRoot contract
 */
const upgradeRoot = async (
  account,
  dexRoot,
  newRoot,
) => {
  logger.log('[DexRoot] upgrade...');
  const tx = await account.runTarget({
    contract: dexRoot,
    method: 'upgrade',
    params: { code: newRoot.code },
    value: locklift.utils.convertCrystal(10, 'nano'),
    keyPair: account.keyPair,
  });

  logger.success(`Root is upgraded: ${tx.id}`);
};

module.exports = {
  upgradePair,
  upgradeRoot,
};
