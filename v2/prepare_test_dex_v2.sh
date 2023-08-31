export PARAMS="--disable-build --network main"

#prepare pool
npx locklift run $PARAMS --script v2/scripts/0-reset-migration.ts
npx locklift run $PARAMS --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='50'
npx locklift run $PARAMS --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='1'
npx locklift run $PARAMS --script v2/scripts/deploy-DexGasValues.ts
npx locklift run $PARAMS --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run $PARAMS --script v2/scripts/1-deploy-vault-and-root.ts
npx locklift run $PARAMS --script v2/scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst"]'
npx locklift run $PARAMS --script v2/scripts/4-deploy-test-dex-account.ts --owner_n=2

#npx locklift test $PARAMS --tests v2/test/30-install-pair-code-v2.ts --contract_name='DexStablePair' --pool_type=2
#npx locklift test $PARAMS --tests v2/test/30-install-pool-code.ts --contract_name='DexStablePool' --pool_type=3

npx locklift run $PARAMS --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","foo"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","bar"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script v2/scripts/5-deploy-test-pool.ts --pools='[["foo", "bar", "qwe"]]' --contract_name='DexStablePool'

npx locklift run $PARAMS --script v2/scripts/6-add-wever-addreses-to-migration-log.ts
npx locklift run $PARAMS --script v2/scripts/7-deploy-test-swap-ever-wever-tip3-contracts.ts

npx locklift test $PARAMS --tests v2/test/35-upgrade-pair.ts --left='tst' --right='foo' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2

npx locklift run $PARAMS --script v2/scripts/90-set-test-params.ts

npx locklift run --disable-build --network main --script v2/scripts/98-mint-test-tokens-to.ts \
--to='0:7a43a08e77dcc2bd7ce2f5f6798dbb84af9c8443e8bfb60c27e125033fef1760' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run --disable-build --network main --script v2/scripts/5-deploy-test-pair.ts --pairs='[["wever","foo"]]' --contract_name='DexPair'
