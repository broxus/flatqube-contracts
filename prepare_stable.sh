#prepare pair
echo "prepare_stable.sh START";

#export DEFAULT_PARAMS="--config locklift.config.js --disable-build --network local"
export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/ton-eth-bridge-token-contracts/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $NO_TRACE --script scripts/0-reset-migration.js
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='0' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='1' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-account.js --key_number='2' --balance='50'
npx locklift run $NO_TRACE --script scripts/0-deploy-TokenFactory.js
npx locklift run $NO_TRACE --script scripts/1-deploy-vault-and-root.js --root_contract_name='DexRootPrev' --pair_contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/2-deploy-test-tokens.js --tokens='["bar","foo","qwe","coin","tst"]'
npx locklift run $NO_TRACE --script scripts/3-mint-test-tokens.js --mints='[{"account":2,"amount":200000000,"token":"bar"},{"account":2,"amount":200000000,"token":"foo"},{"account":2,"amount":200000000,"token":"qwe"},{"account":2,"amount":200000000,"token":"coin"},{"account":2,"amount":200000000,"token":"tst"},{"account":3,"amount":200000000,"token":"foo"},{"account":3,"amount":200000000,"token":"bar"},{"account":3,"amount":200000000,"token":"coin"}]'
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=2
npx locklift run $NO_TRACE --script scripts/4-deploy-test-dex-account.js --owner_n=3

npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["foo", "bar"]]' --contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["coin", "foo"]]' --contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["coin", "bar"]]' --contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["qwe", "coin"]]' --contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["qwe", "tst"]]' --contract_name='DexPairPrev'
npx locklift run $NO_TRACE --script scripts/5-deploy-test-pair.js --pairs='[["coin", "tst"]]' --contract_name='DexPairPrev'

npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='foo' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='coin' --right='foo' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='coin' --right='bar' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='qwe' --right='coin' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='qwe' --right='tst' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'
npx locklift test $NO_TRACE --tests test/09-add-pair-test.js --left='coin' --right='tst' --account=2 --contract_name='DexPairPrev' --ignore_already_added='true'

npx locklift test $NO_TRACE --tests test/10-deposit-to-dex-account.js --deposits='[{ "tokenId": "bar", "amount": 100000000 }, { "tokenId": "foo", "amount": 100000000 }, { "tokenId": "qwe", "amount": 100000000 }, { "tokenId": "coin", "amount": 100000000 }, { "tokenId": "tst", "amount": 100000000 }]'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'foo' --right_token_id 'bar' --left_amount '4844540' --right_amount '4813807' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'coin' --right_token_id 'foo' --left_amount '15497736' --right_amount '5685522' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'coin' --right_token_id 'bar' --left_amount '15497736' --right_amount '5685522' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'qwe' --right_token_id 'coin' --left_amount '39.3109' --right_amount '4161621' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'qwe' --right_token_id 'tst' --left_amount '24.4143' --right_amount '57091' --auto_change 'true' --contract_name='DexPairPrev'
npx locklift test $NO_TRACE --tests test/12-pair-deposit-liquidity.js --left_token_id 'coin' --right_token_id 'tst' --left_amount '32349017' --right_amount '718669' --auto_change 'true' --contract_name='DexPairPrev'

echo "prepare_stable.sh END";
