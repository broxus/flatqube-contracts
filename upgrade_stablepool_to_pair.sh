export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='500'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='200'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":2000000,"token":"foo"},{"account":2,"amount":2000000,"token":"bar"},{"account":3,"amount":2000000,"token":"foo"},{"account":3,"amount":2000000,"token":"bar"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2 --contract_name='DexAccount'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=3 --contract_name='DexAccount'

# prepare stablepool
npx locklift test $DEFAULT_PARAMS --tests test/30-install-pool-code.js --contract_name='DexStablePool' --pool_type=3
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pool.js --pools='[["foo", "bar"]]' --contract_name='DexStablePool'
npx locklift test $NO_TRACE --tests test/09-add-pool-test.js --roots='["foo", "bar"]' --account=2 --contract_name='DexStablePool' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "foo", "amount": 1000000 }, { "tokenId": "bar", "amount": 1000000 }]'
npx locklift test $NO_TRACE --tests test/12-pool-deposit-liquidity.js --roots='["foo", "bar"]' --amounts='[100000, 100000]' --contract_name='DexStablePool'

# upgrade to pair
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexStablePool' --new_contract_name='DexPair' --pool_type=1
