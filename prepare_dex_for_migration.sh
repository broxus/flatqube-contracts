echo "test_only_upgrade.sh START";

npx locklift build --config locklift.config.js

export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

echo "____________________________________________________________________";
echo "prepare dex";
npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='1300'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='200'
npx locklift run $NO_TRACE --script scripts/deploy-DexGasValues.js
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --token_vault_contract_name='DexTokenVaultPrev' --account_contract_name='DexAccountPrev' --stableswap_contract_name='DexStablePairPrev' --pool_contract_name='DexStablePoolPrev' --lp_pending_contract_name='LpTokenPendingPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2 --contract_name='DexAccountPrev'

for (( i=2; i < 40; i++ ))
do
  ii=$((i+1))
  npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number="$i" --balance='5'
  npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n="$ii" --contract_name='DexAccountPrev'
done

for (( i=0; i < 40; i++ ))
do
  npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens="[\"gen$i\"]"
  npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints="[{\"account\":2,\"amount\":200000000,\"token\":\"gen$i\"}]"
done


for (( i=0; i < 40; i+=2 ))
do
  ii=$((i+1))
  npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs="[[\"gen$i\", \"gen$ii\"]]" --contract_name='DexPairPrev'
  npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left="gen$i" --right="gen$ii" --account=2 --contract_name='DexPairPrev' --account_contract_name='DexAccountPrev' --ignore_already_added='true'
done

for (( i=0; i < 40; i++ ))
do
  npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits="[{ \"tokenId\": \"gen$i\", \"amount\": 1000000$i }]"
done

echo "____________________________________________________________________";
npx locklift run $NO_TRACE --script scripts/8-add-wallets-info-to-vault.js

echo "____________________________________________________________________";
echo "prev root ->  root";
npx locklift run $NO_TRACE --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'

echo "____________________________________________________________________";
echo "prev vault ->  vault";
npx locklift run $NO_TRACE --script scripts/update-dexVault.js --old_contract='DexVaultPrev' --new_contract='DexVault'

echo "____________________________________________________________________";
echo "install codes";
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/31-install-account-code.js --contract_name='DexAccount'

echo "____________________________________________________________________";
echo "Add manager";
npx locklift run $NO_TRACE --script scripts/add-vault-manager.js
#
#echo "____________________________________________________________________";
#npx locklift run $NO_TRACE --script scripts/60-migrate-liquidity-to-multivault.js
