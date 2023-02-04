echo "test_only_upgrade.sh START";

npx locklift build --config locklift.config.js

export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

echo "____________________________________________________________________";
echo "prepare dex";
npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='300'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='200'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root-legacy.js --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --account_contract_name='DexAccountPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2 --contract_name='DexAccountPrev'

for (( i=0; i < 20; i++ ))
do
  npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens="[\"gen$i\"]"
  npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints="[{\"account\":2,\"amount\":200000000,\"token\":\"gen$i\"}]"
done


for (( i=0; i < 20; i+=2 ))
do
  ii=$((i+1))
  npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair-legacy.js --pairs="[[\"gen$i\", \"gen$ii\"]]" --contract_name='DexPairPrev'
  npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left="gen$i" --right="gen$ii" --account=2 --contract_name='DexPairPrev' --account_contract_name='DexAccountPrev' --ignore_already_added='true'
done

for (( i=0; i < 19; i++ ))
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
echo "Add manager";
npx locklift run $NO_TRACE --script scripts/add-vault-manager.js
#
#echo "____________________________________________________________________";
#npx locklift run $NO_TRACE --script scripts/60-migrate-liquidity-to-multivault.js
