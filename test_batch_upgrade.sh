export PARAMS="--disable-build --network local"

npx locklift deploy $PARAMS --tags owner-account token-factory wever dex-gas-values --force

# prepare
npx locklift run $PARAMS --script scripts/1-deploy-vault-and-root.ts --token_vault_contract_name='DexTokenVaultPrev' --account_contract_name='DexAccountPrev' --pair_contract_name='DexPairPrev' --stableswap_contract_name='DexStablePairPrev' --pool_contract_name='DexStablePoolPrev'

for (( i=0; i < 40; i++ ))
do
  ii=$((i+1))
  npx locklift run $PARAMS --script scripts/0-deploy-account.ts --key_number="$i" --balance='5'
  npx locklift run $PARAMS --script scripts/4-deploy-test-dex-account.ts --is_owner=false --key_number="$ii" --contract_name='DexAccountPrev'
done

for (( i=0; i < 40; i++ ))
do
  npx locklift run $PARAMS --script scripts/2-deploy-test-tokens.ts --tokens="[\"gen$i\"]"
done

for (( i=0; i+1 < 40; i+=2 ))
do
  ii=$((i+1))
  npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs="[[\"gen$i\", \"gen$ii\"]]" --contract_name='DexPairPrev'
done

for (( i=0; i+2 < 40; i+=3 ))
do
  ii=$((i+1))
  iii=$((i+2))
  npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pools="[[\"gen$i\", \"gen$ii\", \"gen$iii\"]]" --contract_name='DexStablePoolPrev'
done

echo "____________________________________________________________________";
echo "install codes";
npx locklift run $PARAMS --script scripts/prod/36-install-pair-code.ts --contract_name='DexPair' --pool_type=1
npx locklift run $PARAMS --script scripts/prod/37-install-pool-code.ts --contract_name='DexStablePool' --pool_type=3
npx locklift run $PARAMS --script scripts/prod/38-install-dex-account-code.ts --contract_name='DexAccount'
npx locklift run $PARAMS --script scripts/prod/39-install-token-vault-code.ts --contract_name='DexTokenVault'

echo "____________________________________________________________________";
echo "export";
npx locklift run $PARAMS --script scripts/prod/20-export-dex-pairs.ts
npx locklift run $PARAMS --script scripts/prod/21-export-dex-pools.ts
npx locklift run $PARAMS --script scripts/prod/22-export-dex-accounts.ts
npx locklift run $PARAMS --script scripts/prod/23-export-dex-token-vaults.ts

echo "____________________________________________________________________";
echo "update";
# set manager address as dexOwner address (fix later)
npx locklift run $PARAMS --script scripts/add-root-manager.ts

npx locklift run $PARAMS --script scripts/prod/40-upgrade-dex-pairs-batch.ts
npx locklift run $PARAMS --script scripts/prod/41-upgrade-dex-pools-batch.ts
npx locklift run $PARAMS --script scripts/prod/42-force-upgrade-dex-accounts-batch.ts
npx locklift run $PARAMS --script scripts/prod/43-upgrade-dex-token-vaults-batch.ts

npx locklift run $PARAMS --script scripts/10-set-wever-root-to-token-vault.ts
