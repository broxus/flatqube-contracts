echo "test_only_upgrade.sh START";

npx locklift build --config locklift.config.js

export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/ton-eth-bridge-token-contracts/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --root_contract_name='DexRootPrev' --pair_contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":200000000,"token":"bar"},{"account":2,"amount":200000000,"token":"foo"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"]]' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "bar", "amount": 100000000 }, { "tokenId": "foo", "amount": 100000000 }]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '4844540' --right_amount '4813807' --auto_change 'true' --contract_name='DexPairPrev'

npx locklift run $NO_TRACE --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'

npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexStablePair' --pool_type=2


npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2
npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexStablePair' --pool_type=2
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexStablePair' --new_contract_name='DexStablePair' --pool_type=2
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexStablePair' --new_contract_name='DexPair' --pool_type=1

npx locklift test $NO_TRACE --tests test/upgrade/4-root-upgrade-test.js

echo "test_only_upgrade.sh END";
