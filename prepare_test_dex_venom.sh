export PARAMS="--disable-build --network venom_testnet"

npx locklift deploy $PARAMS --tags owner-account token-factory wever dex-gas-values dex-root dex-accounts --force

npx locklift run $PARAMS --script scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst"]'

npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pairs='[["foo","tst"]]' --contract_name='DexStablePool'
npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pairs='[["foo","bar"]]' --contract_name='DexStablePool'
npx locklift run $PARAMS --script scripts/5-deploy-test-pool.ts --pairs='[["foo","qwe"]]' --contract_name='DexStablePool'
npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["foo","bar"]]' --contract_name='DexPair'

npx locklift run $PARAMS --script scripts/98-mint-test-tokens-to.ts \
--to='0:d5d979b24d687f2f16859d5c7a5e5167c2347232a92e189c802f74dc9fb642a2' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run $PARAMS --script scripts/98-mint-test-tokens-to.ts \
--to='0:d5d979b24d687f2f16859d5c7a5e5167c2347232a92e189c802f74dc9fb642a2' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run $PARAMS --script scripts/5-deploy-test-pair.ts --pairs='[["wever","foo"]]' --contract_name='DexPair'

npx locklift run $PARAMS --script scripts/10-set-wever-root-to-token-vault.ts --config locklift.config.ts
