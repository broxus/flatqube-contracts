npx locklift build --config locklift.config.js

npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-reset-migration.js
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='0' --balance='200'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='1' --balance='200'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='2' --balance='1000'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='3' --balance='200'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='4' --balance='200'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-account.js --key_number='5' --balance='100'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/0-deploy-TokenFactory.js
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/1-deploy-vault-and-root.js --pair_contract_name='DexPair' --account_contract_name='DexAccount'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/6-wton-setup.js --wrap_amount=100
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/2-deploy-test-tokens.js --tokens='["bar", "tst"]'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/8-deploy-test-factory-root-limit-order.js
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":20000000,"token":"bar"}, {"account":2, "amount": 1000000,"token":"tst"}, {"account":3,"amount":30000000,"token":"bar"},{"account":4,"amount":1000000,"token":"tst"},{"account":5,"amount":1000000,"token":"tst"},{"account":6,"amount":1000000,"token":"tst"}]'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/4-deploy-test-dex-account.js --owner_n='2' --contact_name='DexAccount'
npx locklift run --config locklift.config.js --disable-build --network dev --script scripts/5-deploy-test-pair.js --pairs='[["bar","tst"]]' --contract_name='DexPair'
npx locklift test --config locklift.config.js --disable-build --network dev --tests test/09-add-pair-test.js --left='bar' --right='tst' --account=2 --contract_name='DexPair' --ignore_already_added='true'
npx locklift test --config locklift.config.js --disable-build --network dev --tests test/10-deposit-to-dex-account.js --deposits='[{"tokenId": "bar", "amount": 200},{"tokenId": "tst", "amount": 2000}]'
npx locklift test --config locklift.config.js --disable-build --network dev --tests test/12-pair-deposit-liquidity.js --left_token_id='bar' --right_token_id='tst' --left_amount='200' --right_amount='2000' --auto_change='false' --contract_name='DexPair'
npx locklift test --config locklift.config.js --disable-build --network dev --tests test/50-test-limit-orders.js