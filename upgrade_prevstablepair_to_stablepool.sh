export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='500'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='200'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev' --vault_contract_name='DexVaultPrev' --account_contract_name='DexAccountPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar","tst"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":2000000,"token":"foo"},{"account":2,"amount":2000000,"token":"bar"},{"account":2,"amount":2000000,"token":"tst"},{"account":3,"amount":2000000,"token":"foo"},{"account":3,"amount":2000000,"token":"bar"},{"account":3,"amount":2000000,"token":"tst"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2 --contract_name='DexAccount'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=3 --contract_name='DexAccount'

# prepare stablepair
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"],["tst","foo"]]' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='tst' --right='foo' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "foo", "amount": 1000000 }, { "tokenId": "bar", "amount": 1000000 }, { "tokenId": "tst", "amount": 1000000 }]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '10000' --right_amount '10000' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'tst' --right_token_id 'foo' --left_amount '10000' --right_amount '10000' --auto_change 'false' --contract_name='DexPairPrev'

npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='DexStablePairPrev' --pool_type=2
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPairPrev' --new_contract_name='DexStablePairPrev' --pool_type=2

npx locklift run $NO_TRACE --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'
npx locklift run $NO_TRACE --script scripts/update-dexVault.js --old_contract='DexVaultPrev' --new_contract='DexVault'
npx locklift test $NO_TRACE --tests test/31-install-account-code.js --contract_name='DexAccount'
npx locklift test $NO_TRACE --tests test/36-upgrade-account.js --owner_n=2 --old_contract_name="DexAccountPrev" --new_contract_name="DexAccount"
npx locklift test $NO_TRACE --tests test/36-upgrade-account.js --owner_n=3 --old_contract_name="DexAccountPrev" --new_contract_name="DexAccount"

# upgrade to stablepool
npx locklift test $NO_TRACE --tests test/30-install-pool-code.js --contract_name='DexStablePool' --pool_type=3
npx locklift test $NO_TRACE --tests test/35-upgrade-pool.js --roots='["foo", "bar"]' --old_contract_name='DexStablePairPrev' --new_contract_name='DexStablePool' --pool_type=3

npx locklift test $NO_TRACE --tests test/15-dex-account-pool-operations.js --roots='["foo", "bar"]' --pool_contract_name='DexStablePool' --account_contract_name='DexAccount'
npx locklift test $NO_TRACE --tests test/20-pool-direct-operations.js --roots='["foo", "bar"]' --contract_name='DexStablePool'

# --pool_route='[["tst","foo"],["foo","bar"]]' --token_route='["tst","foo","FooBarLp"]'
npx locklift test $NO_TRACE --tests test/40-split-cross-pool-exchange.js --amount=1000 --start_token='tst' --route='[{"outcoming": "foo", "roots": ["tst","foo"], "contract_name": "DexPair", "numerator": 1, "nextSteps": [{"outcoming": "FooBarLp", "roots": ["foo","bar"], "contract_name": "DexStablePool", "numerator": 1, "nextSteps": []}]}]'
