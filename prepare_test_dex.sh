export PARAMS="--disable-build --network main"

npx locklift deploy $PARAMS --tags owner-account token-factory wever dex-gas-values dex-root dex-accounts --force

npx locklift run $PARAMS --script scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst"]'

npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["tst","foo"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["tst","bar"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pools='[["foo", "bar", "qwe"]]' --contract_name='DexStablePool'

npx locklift run $PARAMS --script scripts/35-upgrade-pair.ts --roots='["tst", "foo"]' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2

npx locklift run $PARAMS --script scripts/90-set-test-params.ts

npx locklift run $PARAMS --script scripts/98-mint-test-tokens-to.ts \
--to='0:7a43a08e77dcc2bd7ce2f5f6798dbb84af9c8443e8bfb60c27e125033fef1760' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run $PARAMS --script scripts/98-mint-test-tokens-to.ts \
--to='0:33478651d9c7b44c1b45c2dfe85edf7a5d24692f5222f0a25c176b1abfd95e51' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["wever","foo"]]' --contract_name='DexPair'

npx locklift run $PARAMS --script scripts/10-set-wever-root-to-token-vault.ts --config locklift.config.ts

