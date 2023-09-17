export PARAMS="--disable-build --network local"

npx locklift deploy $PARAMS --tags owner-account tokens token-factory wever --force

npx locklift run $PARAMS --script v2/scripts/deploy-DexGasValues.ts --gas_contract_name="DexGasValuesPrev"
npx locklift run $PARAMS --script v2/scripts/1-deploy-vault-and-root.ts --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --token_vault_contract_name='DexTokenVaultPrev' --account_contract_name='DexAccountPrev' --pair_contract_name='DexPairPrev' --stableswap_contract_name='DexStablePairPrev' --pool_contract_name='DexStablePoolPrev'
npx locklift run $PARAMS --script v2/scripts/4-deploy-test-dex-account.ts --contract_name='DexAccountPrev'
npx locklift run $PARAMS --script v2/scripts/5-deploy-test-pair.ts --pairs='[["6-0", "wever"], ["6-0", "18-0"]]' --contract_name='DexPairPrev' --deposit=true
npx locklift run $PARAMS --script v2/scripts/35-upgrade-pair.ts --roots='["6-0", "18-0"]' --old_contract_name='DexPairPrev' --new_contract_name='DexStablePairPrev' --pool_type=2
npx locklift run $PARAMS --script v2/scripts/5-deploy-test-pool.ts --pools='[["6-0", "9-0", "18-0"]]' --contract_name='DexStablePoolPrev' --deposit=true

echo "____________________________________________________________________";
echo "prev gas values -> gas values";
npx locklift run $PARAMS --script v2/scripts/upgrade-DexGasValues.ts

echo "____________________________________________________________________";
echo "prev root -> root";
npx locklift run $PARAMS --script v2/scripts/update-dexRoot.ts --old_contract='DexRootPrev' --new_contract='DexRoot'

echo "____________________________________________________________________";
echo "prev dex account -> dex account";
npx locklift run $PARAMS --script v2/scripts/update-dexAccount.ts --old_contract_name='DexAccountPrev' --new_contract_name='DexAccount'

echo "____________________________________________________________________";
echo "prev vault -> vault";
npx locklift run $PARAMS --script v2/scripts/update-dexVault.ts --old_contract='DexVaultPrev' --new_contract='DexVault'

echo "____________________________________________________________________";
echo "prev pair -> pair";
npx locklift run $PARAMS --script v2/scripts/35-upgrade-pair.ts --roots='["6-0", "wever"]' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1

echo "____________________________________________________________________";
echo "prev stable pair -> stable pair";
npx locklift run $PARAMS --script v2/scripts/35-upgrade-pair.ts --roots='["6-0", "18-0"]' --old_contract_name='DexStablePairPrev' --new_contract_name='DexStablePair' --pool_type=2

echo "____________________________________________________________________";
echo "prev stable pool -> stable pool";
npx locklift run $PARAMS --script v2/scripts/35-upgrade-pool.ts --roots='["6-0", "9-0", "18-0"]' --old_contract_name='DexStablePoolPrev' --new_contract_name='DexStablePool'

echo "____________________________________________________________________";
echo "prev token vault -> token vault";
npx locklift run $PARAMS --script v2/scripts/38-upgrade-token-vault.ts --token="wever" --old_contract_name="DexTokenVaultPrev" --new_contract_name="DexTokenVault"
npx locklift run $PARAMS --script v2/scripts/10-set-wever-root-to-token-vault.ts

echo "get-evers-back";
npx locklift run $PARAMS --script v2/scripts/99-get-evers-back.ts
