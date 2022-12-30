#export DEFAULT_PARAMS="--config locklift.config.js --disable-build --network local"
export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '4844540' --right_amount '4813807' --contract_name='DexStablePair'

npx locklift test $NO_TRACE --tests test/15-dex-account-pair-operations.js --pair_contract_name='DexStablePair' --account_contract_name='DexAccount'

npx locklift test $NO_TRACE --tests test/20-pair-direct-operations.js --contract_name='DexStablePair'
npx locklift test $NO_TRACE --tests test/20-pair-direct-operations-v2.js --contract_name='DexStablePair'

npx locklift test $NO_TRACE --tests test/40-cross-pair-exchange.js --amount=10000 --route='["bar","foo","coin","qwe","tst"]' --contract_name='DexStablePair'
npx locklift test $NO_TRACE --tests test/40-cross-pair-exchange.js --amount=100 --route='["tst","qwe","coin","bar","foo"]' --contract_name='DexStablePair'
npx locklift test $NO_TRACE --tests test/40-cross-pair-exchange.js --amount=10000 --route='["coin","foo","bar"]' --contract_name='DexStablePair'

npx locklift test $NO_TRACE --tests test/51-referrer-beneficiary-fee.js --roots='["foo", "bar"]' --pool_contract_name='DexStablePair' --fee='{"denominator": "1000000000", "pool_numerator": "0", "beneficiary_numerator": "1000000", "referrer_numerator": "2000000"}'
