ARGS=(--config locklift.config.ts --disable-build -n local)

npx locklift run "${ARGS[@]}" --script v2/scripts/0-reset-migration.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='50'
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='1' --balance='1000'
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-account.ts --key_number='2' --balance='1000'

npx locklift run "${ARGS[@]}" --script v2/scripts/deploy-DexGasValues.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/0-deploy-TokenFactory.ts
npx locklift run "${ARGS[@]}" --script v2/scripts/1-deploy-vault-and-root.ts --pair_contract_name='DexPair' --account_contract_name='DexAccount'
npx locklift run "${ARGS[@]}" --script v2/scripts/9-deploy-wever-vault.ts --wrap-amount=900
npx locklift run "${ARGS[@]}" --script v2/scripts/2-deploy-test-tokens.ts --tokens='["tst","qwe"]'
npx locklift run "${ARGS[@]}" --script v2/scripts/3-mint-test-tokens.ts --mints='[{"account":2,"amount":100000,"token":"tst"},{"account":2,"amount":100000,"token":"qwe"}]'
npx locklift run "${ARGS[@]}" --script v2/scripts/4-deploy-test-dex-account.ts --owner_n='2' --contact_name='DexAccount'
npx locklift run "${ARGS[@]}" --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","wever"]]' --contract_name='DexPair'
npx locklift run "${ARGS[@]}" --script v2/scripts/10-set-wever-root-to-token-vault.ts

npx locklift test "${ARGS[@]}" --tests v2/test/09-add-pair-test.ts --left='tst' --right='wever' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test "${ARGS[@]}" --tests v2/test/10-deposit-to-dex-account.ts --deposits='[{"tokenId": "tst", "amount": 10000},{"tokenId": "wever", "amount": 500}]'
npx locklift test "${ARGS[@]}" --tests v2/test/12-pair-deposit-liquidity.ts --left_token_id='tst' --right_token_id='wever' --left_amount='5000' --right_amount='500' --auto_change='false' --contract_name='DexPair'

npx locklift run "${ARGS[@]}" --script v2/scripts/5-deploy-test-pair.ts --pairs='[["tst","qwe"]]' --contract_name='DexPair'
npx locklift test "${ARGS[@]}" --tests v2/test/09-add-pair-test.ts --left='tst' --right='qwe' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test "${ARGS[@]}" --tests v2/test/10-deposit-to-dex-account.ts --deposits='[{"tokenId": "qwe", "amount": 5000}]'
npx locklift test "${ARGS[@]}" --tests v2/test/12-pair-deposit-liquidity.ts --left_token_id='tst' --right_token_id='qwe' --left_amount='5000' --right_amount='5000' --auto_change='false' --contract_name='DexPair'

npx locklift test "${ARGS[@]}" --tests v2/test/46-test-wever-vault-swaps.ts

npx locklift test "${ARGS[@]}" --tests v2/test/42-wever-vault-cross-pool-exchange.ts --amount=100 --start-token='wever' --route='[{ "outcoming": "tst", "roots": ["tst", "wever"] }, { "outcoming": "qwe", "roots": ["tst", "qwe"] }]'
npx locklift test "${ARGS[@]}" --tests v2/test/42-wever-vault-cross-pool-exchange.ts --amount=300 --start-token='qwe' --route='[{ "outcoming": "tst", "roots": ["tst", "qwe"] }, { "outcoming": "wever", "roots": ["tst", "wever"] }]' --to-native true
npx locklift test "${ARGS[@]}" --tests v2/test/42-wever-vault-cross-pool-exchange.ts --amount=20 --start-token='wever' --route='[{ "outcoming": "tst", "roots": ["tst", "wever"] }, { "outcoming": "qwe", "roots": ["tst", "qwe"] }]'

npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='0'
npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='1'
npx locklift run "${ARGS[@]}" --script v2/scripts/99-get-evers-back.ts --key_number='2'

npx locklift run "${ARGS[@]}" --script v2/scripts/0-backup-migration.ts
