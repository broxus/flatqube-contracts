echo "test_only_upgrade.sh START";

npx locklift build --config locklift.config.js

export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

echo "____________________________________________________________________";
echo "prepare dex";
npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --account_contract_name='DexAccountPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar","qwe"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":200000000,"token":"bar"},{"account":2,"amount":200000000,"token":"foo"},{"account":2,"amount":200000000,"token":"qwe"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2 --contract_name='DexAccountPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"], ["bar", "qwe"]]' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexStablePair' --pool_type=2


npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "bar", "amount": 100000000 }, { "tokenId": "foo", "amount": 100000000 }]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '100000' --right_amount '100000' --auto_change 'false' --contract_name='DexPairPrev'

echo "____________________________________________________________________";
echo "prev root ->  root";
npx locklift run $NO_TRACE --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'

echo "____________________________________________________________________";
echo "prev account ->  account";
npx locklift test $NO_TRACE --tests test/31-install-account-code.js --contract_name='DexAccount'
npx locklift test $NO_TRACE --tests test/36-upgrade-account.js --owner_n=2 --old_contract_name="DexAccountPrev" --new_contract_name="DexAccount"

echo "____________________________________________________________________";
echo "account -> next account";
npx locklift test $NO_TRACE --tests test/31-install-account-code.js --contract_name='DexAccount'
npx locklift test $NO_TRACE --tests test/36-upgrade-account.js --owner_n=2 --old_contract_name="DexAccount" --new_contract_name="DexAccount"

echo "____________________________________________________________________";
echo "prev vault ->  vault";
npx locklift run $DEFAULT_PARAMS --script scripts/update-dexVault.js --old_contract='DexVaultPrev' --new_contract='DexVault'

echo "____________________________________________________________________";
echo "prev pair -> pair";
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='bar' --right='qwe' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1

echo "____________________________________________________________________";
echo "prepare pools";
npx locklift test $NO_TRACE --tests test/30-install-pool-code.js --contract_name='DexStablePool' --pool_type=3
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pool.js --pools='[["foo", "bar", "qwe"],["foo","qwe"]]' --contract_name='DexStablePool'
npx locklift test $NO_TRACE --tests test/09-add-pool-test.js --roots='["foo", "bar", "qwe"]' --account=2 --contract_name='DexStablePool' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pool-test.js --roots='["foo", "qwe"]' --account=2 --contract_name='DexStablePool' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "foo", "amount": 100000000 },{ "tokenId": "qwe", "amount": 100000000 }]'
npx locklift test $NO_TRACE --tests test/12-pool-deposit-liquidity.js --roots='["foo", "bar", "qwe"]' --amounts='[100000, 100000, 100000]' --contract_name='DexStablePool'
npx locklift test $NO_TRACE --tests test/12-pool-deposit-liquidity.js --roots='["foo", "qwe"]' --amounts='[100000, 100000]' --contract_name='DexStablePool'

echo "____________________________________________________________________";
echo "pair -> stablepair";
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='bar' --right='qwe' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2

echo "____________________________________________________________________";
echo "stablepair -> next stablepair";
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='TestNewDexStablePair' --pool_type=2
npx locklift test $DEFAULT_PARAMS --tests test/35-upgrade-pair.js --left='bar' --right='qwe' --old_contract_name='DexStablePair' --new_contract_name='TestNewDexStablePair' --pool_type=2

echo "____________________________________________________________________";
echo "stablepair -> pair";
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexStablePair' --new_contract_name='DexPair' --pool_type=1

echo "____________________________________________________________________";
echo "pair -> next pair";
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='TestNewDexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPair' --new_contract_name='TestNewDexPair' --pool_type=1

echo "____________________________________________________________________";
echo "prepare pools";

echo "____________________________________________________________________";
echo "pool -> pair";
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='qwe' --old_contract_name='DexStablePool' --new_contract_name='DexPair' --pool_type=1

echo "____________________________________________________________________";
echo "pair -> pool";
npx locklift test $NO_TRACE --tests test/35-upgrade-pool.js --roots='["foo", "qwe"]' --old_contract_name='DexPair' --new_contract_name='DexStablePool' --pool_type=3

echo "____________________________________________________________________";
echo "pool -> next pool";
npx locklift test $NO_TRACE --tests test/30-install-pool-code.js --contract_name='DexStablePool' --pool_type=3
npx locklift test $NO_TRACE --tests test/35-upgrade-pool.js --roots='["foo", "bar", "qwe"]' --old_contract_name='DexStablePool' --new_contract_name='DexStablePool' --pool_type=3
echo "____________________________________________________________________";
echo "vault ->  next vault";
npx locklift run $NO_TRACE --script scripts/update-dexVault.js --old_contract='DexVault' --new_contract='DexVault'

echo "____________________________________________________________________";
echo "root ->  next root";
#npx locklift run $DEFAULT_PARAMS --script scripts/update-dexRoot.js --old_contract='DexRoot' --new_contract='TestNewDexRoot'
npx locklift test $DEFAULT_PARAMS --tests test/upgrade/4-root-upgrade-test.js


echo "test_only_upgrade.sh END";
