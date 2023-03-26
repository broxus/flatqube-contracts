export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='1000'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='1000'
npx locklift run $NO_TRACE --script scripts/deploy-DexGasValues.js
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPair' --account_contract_name='DexAccount'
npx locklift run $NO_TRACE --script scripts/6-wton-setup.js --wrap_amount=900
npx locklift run $NO_TRACE --script scripts/7-deploy-test-swap-ever-wever-tip3-contracts.js
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["tst","qwe"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":100000,"token":"tst"},{"account":2,"amount":100000,"token":"qwe"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n='2' --contact_name='DexAccount'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["tst","wever"]]' --contract_name='DexPair'

npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='tst' --right='wever' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{"tokenId": "tst", "amount": 10000},{"tokenId": "wever", "amount": 500}]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id='tst' --right_token_id='wever' --left_amount='5000' --right_amount='500' --auto_change='false' --contract_name='DexPair'

npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["tst","qwe"]]' --contract_name='DexPair'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='tst' --right='qwe' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{"tokenId": "qwe", "amount": 5000}]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id='tst' --right_token_id='qwe' --left_amount='5000' --right_amount='5000' --auto_change='false' --contract_name='DexPair'

npx locklift test $NO_TRACE --tests test/45-test-swap-ever-wever-to-tip3-contracts.js

# --pool_route='[["tst","wever"],["tst", "qwe"]]' --token_route='["wever","tst","qwe"]'
npx locklift test $NO_TRACE --tests test/41-ever-split-cross-pool-exchange.js --amount=100 --start_token='wever' --route='[{"outcoming": "tst", "roots": ["tst","wever"], "numerator": 1, "nextSteps": [{"outcoming": "qwe", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": []}]}]'

# --pool_route='[["tst","qwe"],["tst", "wever"]]' --token_route='["qwe","tst","wever"]'
npx locklift test $NO_TRACE --tests test/41-ever-split-cross-pool-exchange.js --amount=300 --start_token='qwe' --route='[{"outcoming": "tst", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": [{"outcoming": "wever", "roots": ["tst","wever"], "numerator": 1, "nextSteps": []}]}]'

# --pool_route='[["tst","wever"],["tst", "qwe"]]' --token_route='["wever","tst","qwe"]'
npx locklift test $NO_TRACE --tests test/41-ever-split-cross-pool-exchange.js --amount=20 --start_token='wever' --route='[{"outcoming": "tst", "roots": ["tst","wever"], "numerator": 1, "nextSteps": [{"outcoming": "qwe", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": []}]}]' --multi=false

npx locklift run $NO_TRACE --script scripts/99-get-evers-back.js --key_number='0'
npx locklift run $NO_TRACE --script scripts/99-get-evers-back.js --key_number='1'
npx locklift run $NO_TRACE --script scripts/99-get-evers-back.js --key_number='2'
