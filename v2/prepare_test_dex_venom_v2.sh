export PARAMS="--disable-build --network venom_testnet"

#prepare pool
npx locklift run --disable-build --network venom_testnet --script v2/scripts/0-reset-migration.ts
npx locklift run --disable-build --network venom_testnet --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='50'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='10'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/deploy-DexGasValues.ts
npx locklift run --disable-build --network venom_testnet --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run --disable-build --network venom_testnet --script v2/scripts/1-deploy-vault-and-root.ts
npx locklift run --disable-build --network venom_testnet --script v2/scripts/2-deploy-test-tokens.ts --tokens='["foo","bar","qwe","tst"]'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/4-deploy-test-dex-account.ts --owner_n=2

#npx locklift test --disable-build --network venom_testnet --tests v2/test/30-install-pair-code-v2.ts --contract_name='DexStablePair' --pool_type=2
#npx locklift test --disable-build --network venom_testnet --tests v2/test/30-install-pool-code.ts --contract_name='DexStablePool' --pool_type=3

npx locklift run --disable-build --network venom_testnet --script v2/scripts/5-deploy-test-pool.ts --pairs='[["foo","tst"]]' --contract_name='DexStablePool'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/5-deploy-test-pool.ts --pairs='[["foo","bar"]]' --contract_name='DexStablePool'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/5-deploy-test-pool.ts --pairs='[["foo","qwe"]]' --contract_name='DexStablePool'
npx locklift run --disable-build --network venom_testnet --script v2/scripts/5-deploy-test-pair.ts --pairs='[["foo","bar"]]' --contract_name='DexPair'

npx locklift run --disable-build --network venom_testnet --script v2/scripts/6-add-wever-addreses-to-migration-log.ts
#npx locklift run --disable-build --network venom_testnet --script v2/scripts/7-deploy-test-swap-ever-wever-tip3-contracts.ts

npx locklift run --disable-build --network venom_testnet --script v2/scripts/98-mint-test-tokens-to.ts \
--to='0:d5d979b24d687f2f16859d5c7a5e5167c2347232a92e189c802f74dc9fb642a2' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run --disable-build --network venom_testnet --script v2/scripts/98-mint-test-tokens-to.ts \
--to='0:d5d979b24d687f2f16859d5c7a5e5167c2347232a92e189c802f74dc9fb642a2' \
--mints='[{"account":2,"amount":200000000,"token":"foo"}, {"account":2,"amount":200000000,"token":"bar"}, {"account":2,"amount":200000000,"token":"tst"}, {"account":2,"amount":200000000,"token":"qwe"}]'

npx locklift run --disable-build --network venom_testnet --script v2/scripts/5-deploy-test-pair.ts --pairs='[["wever","foo"]]' --contract_name='DexPair'

npx locklift run --disable-build --network venom_testnet --script v2/scripts/10-set-wever-root-to-token-vault.ts --config locklift.config.ts
