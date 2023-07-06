export DEFAULT_PARAMS="--config ./locklift-v2.config.ts --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config ./locklift-v2.config.ts --disable-build --network local"

#prepare pool
npx locklift run $NO_TRACE --script v2/scripts/0-reset-migration.ts
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='150'
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='1000'
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='2' --balance='75'
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='3' --balance='75'
npx locklift run $NO_TRACE --script v2/scripts/deploy-DexGasValues.ts
npx locklift run $NO_TRACE --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run $NO_TRACE --script v2/scripts/1-deploy-vault-and-root.ts --pair_contract_name='DexPair' --root_contract_name='DexRoot'
npx locklift run $NO_TRACE --script v2/scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst","coin"]'
npx locklift run $NO_TRACE --script v2/scripts/3-mint-test-tokens.ts --mints='[{"account":2,"amount":2000000,"token":"foo"},{"account":2,"amount":2000000,"token":"bar"},{"account":2,"amount":4000000,"token":"qwe"},{"account":2,"amount":1000000,"token":"tst"},{"account":2,"amount":1000000,"token":"coin"},{"account":3,"amount":2000000,"token":"foo"},{"account":3,"amount":2000000,"token":"bar"},{"account":3,"amount":1000000,"token":"qwe"},{"account":3,"amount":1000000,"token":"tst"},{"account":3,"amount":1000000,"token":"coin"}]'
npx locklift run $NO_TRACE --script v2/scripts/4-deploy-test-dex-account.ts --owner_n=2
npx locklift run $NO_TRACE --script v2/scripts/4-deploy-test-dex-account.ts --owner_n=3

npx locklift test $NO_TRACE --tests v2/test/30-install-pair-code-v2.ts --contract_name='DexStablePair' --pool_type=2
npx locklift test $DEFAULT_PARAMS --tests v2/test/30-install-pool-code.ts --contract_name='DexStablePool' --pool_type=3

npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pair.ts --pairs='[["bar","coin"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","bar"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pool.ts --pools='[["foo", "bar", "qwe"]]' --contract_name='DexStablePool'
npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pair.ts --pairs='[["FooBarQweLp", "tst"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script v2/scripts/dynamic-gas-test-account.ts
npx locklift run $NO_TRACE --script v2/scripts/dynamic-gas-test.ts

#npx locklift run $NO_TRACE --script v2/scripts/6-wton-setup.ts --wrap_amount=900
#npx locklift run $NO_TRACE --script v2/scripts/7-deploy-test-swap-ever-wever-tip3-contracts.ts
#npx locklift run $NO_TRACE --script v2/scripts/5-deploy-test-pair.ts --pairs='[["foo","wever"]]' --contract_name='DexPair'
#npx locklift run $NO_TRACE --script v2/scripts/dynamic-gas-ever-wever-tip3.ts

#npx locklift test $NO_TRACE --tests v2/test/35-upgrade-pair.ts --left='tst' --right='foo' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2
#
#npx locklift test $NO_TRACE --tests v2/test/35-upgrade-pool.ts --roots='["foo", "bar", "qwe"]' --old_contract_name='DexStablePool' --new_contract_name='DexStablePool' --pool_type=3
