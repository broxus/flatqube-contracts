export PARAMS="--disable-build --network main"

npx locklift deploy $PARAMS --tags owner-account token-factory wever dex-gas-values dex-root dex-accounts --force

npx locklift run $PARAMS --script scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst"]'

npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["tst","foo"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["tst","bar"]]' --contract_name='DexPair'
npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pools='[["foo", "bar", "qwe"]]' --contract_name='DexStablePool'

npx locklift run $PARAMS --script scripts/35-upgrade-pair.ts --roots='["tst", "foo"]' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2

npx locklift run $PARAMS --script scripts/90-set-test-params.ts

#npx locklift run $PARAMS --script scripts/10-set-wever-root-to-token-vault.ts
