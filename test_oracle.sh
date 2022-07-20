export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/ton-eth-bridge-token-contracts/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

# reset migration
npx locklift run $NO_TRACE --script scripts/0-reset-migration.js

# Create ever accounts
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='50'

# Init dex and tokens
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPairPrev' --root_contract_name='DexRootPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar","qwe","tst"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":2000000,"token":"foo"},{"account":2,"amount":2000000,"token":"bar"},{"account":2,"amount":1000000,"token":"qwe"},{"account":2,"amount":1000000,"token":"tst"},{"account":3,"amount":2000000,"token":"foo"},{"account":3,"amount":2000000,"token":"bar"},{"account":3,"amount":1000000,"token":"qwe"}]'

# Create dex accounts
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=3

npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"]]' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "foo", "amount": 1000000 }, { "tokenId": "bar", "amount": 1000000 }]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '10000' --right_amount '10000' --auto_change 'true' --contract_name='DexPairPrev'

npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "tst"],["bar", "tst"],["bar", "qwe"],["foo", "qwe"]]' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/00-token-factory-test.js
npx locklift test $NO_TRACE --tests test/01-base-root-and-vault-test.js --pair_contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='bar' --right='qwe' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='qwe' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='tst' --account=2 --ignore_already_added='true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='bar' --right='tst' --account=2 --ignore_already_added='true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "qwe", "amount": 1000000 }, { "tokenId": "tst", "amount": 1000000 }]'

npx locklift run $NO_TRACE --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'

npx locklift test $NO_TRACE --tests test/30-install-pair-code-v2.js --contract_name='TestOracleDexPair' --pool_type=1

# update pairs
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='bar' --right='qwe' --old_contract_name='DexPairPrev' --new_contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPairPrev' --new_contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='qwe' --old_contract_name='DexPairPrev' --new_contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='tst' --old_contract_name='DexPairPrev' --new_contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='bar' --right='tst' --old_contract_name='DexPairPrev' --new_contract_name='TestOracleDexPair'

npx locklift test $NO_TRACE --tests test/52-set-oracle-points.js --left='Bar' --right='Qwe'
npx locklift test $NO_TRACE --tests test/52-set-oracle-points.js --left='Foo' --right='Bar'
npx locklift test $NO_TRACE --tests test/52-set-oracle-points.js --left='Foo' --right='Qwe'
npx locklift test $NO_TRACE --tests test/52-set-oracle-points.js --left='Foo' --right='Tst'
npx locklift test $NO_TRACE --tests test/52-set-oracle-points.js --left='Bar' --right='Tst'

# initial liquidity deposit
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'bar' --right_token_id 'qwe' --left_amount '10000' --right_amount '10000' --auto_change 'false' --contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'qwe' --left_amount '10000' --right_amount '10000' --auto_change 'false' --contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'tst' --left_amount '10000' --right_amount '10000' --auto_change 'false' --contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'bar' --right_token_id 'tst' --left_amount '10000' --right_amount '10000' --auto_change 'false' --contract_name='TestOracleDexPair'

# old tests
npx locklift test $NO_TRACE --tests test/15-dex-account-pair-operations.js --pair_contract_name='TestOracleDexPair' --account_contract_name='DexAccount'
npx locklift test $NO_TRACE --tests test/20-pair-direct-operations.js --contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/25-dex-accounts-interaction.js --pair_contract_name='TestOracleDexPair' --account_contract_name='DexAccount'

npx locklift test $NO_TRACE --tests test/50-beneficiary-fee.js --fee='{"denominator": "1000000000", "pool_numerator": "2000000", "beneficiary_numerator": "3000000"}' --pair_contract_name='TestOracleDexPair'
npx locklift test $NO_TRACE --tests test/50-beneficiary-fee.js --fee='{"denominator": "1000000000", "pool_numerator": "0", "beneficiary_numerator": "1000000"}' --pair_contract_name='TestOracleDexPair'
