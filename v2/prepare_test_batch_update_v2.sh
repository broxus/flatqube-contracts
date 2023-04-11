export DEFAULT_PARAMS="--config ./locklift-v2.config.ts --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config ./locklift-v2.config.ts --disable-build --network local"

npx locklift build --config ./locklift-v2.config.ts

#prepare pool
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='1300'
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='200'
npx locklift run $NO_TRACE --script v2/scripts/deploy-DexGasValues.ts
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run $NO_TRACE --script v2/scripts/1-deploy-vault-and-root.ts --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --token_vault_contract_name='DexTokenVaultPrev' --account_contract_name='DexAccountPrev' --stableswap_contract_name='DexStablePairPrev' --pool_contract_name='DexStablePoolPrev' --lp_pending_contract_name='LpTokenPendingPrev'
npx locklift run $NO_TRACE --script v2/scripts/2-deploy-test-tokens.ts --tokens='["foo","bar"]'
npx locklift run $NO_TRACE --script v2/scripts/3-mint-test-tokens.ts --mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}]'
npx locklift run $NO_TRACE --script v2/scripts/4-deploy-test-dex-account.ts --owner_n=2 --contract_name='DexAccountPrev'

for (( i=2; i < 40; i++ ))
do
  ii=$((i+1))
  npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number="$i" --balance='5'
  npx locklift run $NO_TRACE --script v2/scripts/4-deploy-test-dex-account.ts --owner_n="$ii" --contract_name='DexAccountPrev'
done

for (( i=0; i < 40; i++ ))
do
  npx locklift run $NO_TRACE --script v2/scripts/2-deploy-test-tokens.ts --tokens="[\"gen$i\"]"
  npx locklift run $NO_TRACE --script v2/scripts/3-mint-test-tokens.ts --mints="[{\"account\":2,\"amount\":200000000,\"token\":\"gen$i\"}]"
done

for (( i=0; i < 40; i+=2 ))
do
  ii=$((i+1))
  npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pair.ts --pairs="[[\"gen$i\", \"gen$ii\"]]" --contract_name='DexPairPrev'
done

for (( i=0; i < 40; i+=3 ))
do
  ii=$((i+1))
  iii=$((i+2))
  npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pool.ts --pools="[[\"gen$i\", \"gen$ii\", \"gen$iii\"]]" --contract_name='DexStablePoolPrev'
done

echo "____________________________________________________________________";
echo "prev root ->  root";
npx locklift run $NO_TRACE --script v2/scripts/update-dexRoot.ts --old_contract='DexRootPrev' --new_contract='DexRoot'

echo "____________________________________________________________________";
echo "prev vault ->  vault";
npx locklift run $NO_TRACE --script v2/scripts/update-dexVault.ts --old_contract='DexVaultPrev' --new_contract='DexVault'

echo "____________________________________________________________________";
echo "install codes";
npx locklift test $NO_TRACE --tests v2/test/30-install-pair-code-v2.ts --contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests v2/test/30-install-pool-code.ts --contract_name='DexStablePool' --pool_type=3