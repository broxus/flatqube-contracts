npx locklift build --config locklift.config.js

export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --account_contract_name='DexAccount' --pair_contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["foo","bar","qwe","tst"]'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "qwe"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["qwe", "bar"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "tst"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["tst", "bar"]]' --contract_name='DexPair'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["qwe", "tst"]]' --contract_name='DexPair'
