ARGS=(--config locklift.config.ts --disable-build -n local)

npx locklift run "${ARGS[@]}" --script v2/scripts/0-reset-migration.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='50'
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='1000'
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='2' --balance='1000'
npx locklift run "${ARGS[@]}" --script v2/scripts/deploy-DexGasValues.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/1-deploy-vault-and-root.ts --pair_contract_name='DexPair' --account_contract_name='DexAccount'
npx locklift run "${ARGS[@]}" --script v2/scripts/6-wton-setup.ts --wrap_amount=900
npx locklift run "${ARGS[@]}" --script v2/scripts/7-deploy-test-swap-ever-wever-tip3-contracts.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/2-deploy-test-tokens.ts --tokens='["tst","qwe"]'
npx locklift run "${ARGS[@]}" --script v2/scripts/3-mint-test-tokens.ts --mints='[{"account":2,"amount":100000,"token":"tst"},{"account":2,"amount":100000,"token":"qwe"}]'
npx locklift run "${ARGS[@]}" --script v2/scripts/4-deploy-test-dex-account.ts --owner_n='2' --contact_name='DexAccount'
npx locklift run "${ARGS[@]}" --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","wever"]]' --contract_name='DexPair'

npx locklift test "${ARGS[@]}" --tests v2/test/09-add-pair-test.ts --left='tst' --right='wever' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test "${ARGS[@]}" --tests v2/test/10-deposit-to-dex-account.ts --deposits='[{"tokenId": "tst", "amount": 10000},{"tokenId": "wever", "amount": 500}]'
npx locklift test "${ARGS[@]}" --tests v2/test/12-pair-deposit-liquidity.ts --left_token_id='tst' --right_token_id='wever' --left_amount='5000' --right_amount='500' --auto_change='false' --contract_name='DexPair'

npx locklift run "${ARGS[@]}" --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","qwe"]]' --contract_name='DexPair'
npx locklift test "${ARGS[@]}" --tests v2/test/09-add-pair-test.ts --left='tst' --right='qwe' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test "${ARGS[@]}" --tests v2/test/10-deposit-to-dex-account.ts --deposits='[{"tokenId": "qwe", "amount": 5000}]'
npx locklift test "${ARGS[@]}" --tests v2/test/12-pair-deposit-liquidity.ts --left_token_id='tst' --right_token_id='qwe' --left_amount='5000' --right_amount='5000' --auto_change='false' --contract_name='DexPair'

npx locklift test "${ARGS[@]}" --tests v2/test/45-test-swap-ever-wever-to-tip3-contracts.ts

# --pool_route='[["tst","wever"],["tst", "qwe"]]' --token_route='["wever","tst","qwe"]'
npx locklift test "${ARGS[@]}" --tests v2/test/41-ever-split-cross-pool-exchange.ts --amount=100 --start_token='wever' --route='[{"outcoming": "tst", "roots": ["tst","wever"], "numerator": 1, "nextSteps": [{"outcoming": "qwe", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": []}]}]'

# --pool_route='[["tst","qwe"],["tst", "wever"]]' --token_route='["qwe","tst","wever"]'
npx locklift test "${ARGS[@]}" --tests v2/test/41-ever-split-cross-pool-exchange.ts --amount=300 --start_token='qwe' --route='[{"outcoming": "tst", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": [{"outcoming": "wever", "roots": ["tst","wever"], "numerator": 1, "nextSteps": []}]}]'

# --pool_route='[["tst","wever"],["tst", "qwe"]]' --token_route='["wever","tst","qwe"]'
npx locklift test "${ARGS[@]}" --tests v2/test/41-ever-split-cross-pool-exchange.ts --amount=20 --start_token='wever' --route='[{"outcoming": "tst", "roots": ["tst","wever"], "numerator": 1, "nextSteps": [{"outcoming": "qwe", "roots": ["tst","qwe"], "numerator": 1, "nextSteps": []}]}]' --multi=false

npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='0'
npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='1'
npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='2'

npx locklift run "${ARGS[@]}" --script v2/scripts/0-backup-migration.ts
