export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/ton-eth-bridge-token-contracts/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

#prepare pool
npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPair' --pool_contract_name='DexStablePool' --root_contract_name='DexRoot'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar","qwe","tst"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":2000000,"token":"foo"},{"account":2,"amount":2000000,"token":"bar"},{"account":2,"amount":1000000,"token":"qwe"},{"account":2,"amount":1000000,"token":"tst"},{"account":3,"amount":2000000,"token":"foo"},{"account":3,"amount":2000000,"token":"bar"},{"account":3,"amount":1000000,"token":"qwe"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=3
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pool.js --pools='[["foo", "bar", "qwe"]]' --contract_name='DexStablePool'
npx locklift test $NO_TRACE --tests test/09-add-pool-test.js --roots='["foo", "bar", "qwe"]' --account=2 --contract_name='DexStablePool' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "foo", "amount": 1000000 }, { "tokenId": "bar", "amount": 1000000 },  { "tokenId": "qwe", "amount": 1000000 }]'

npx locklift test $NO_TRACE --tests test/12-pool-deposit-liquidity.js --roots='["foo", "bar", "qwe"]' --amounts='[100000, 100000, 100000]' --contract_name='DexStablePool'

npx locklift test $NO_TRACE --tests test/15-dex-account-pool-operations.js --roots='["foo", "bar", "qwe"]' --pool_contract_name='DexStablePool' --account_contract_name='DexAccount'

npx locklift test $NO_TRACE --tests test/20-pool-direct-operations.js --roots='["foo", "bar", "qwe"]' --contract_name='DexStablePool'