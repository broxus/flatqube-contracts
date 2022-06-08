echo "upgrade_stable.sh START";

#export DEFAULT_PARAMS="--config locklift.config.js --disable-build --network local"
export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/ton-eth-bridge-token-contracts/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift run $DEFAULT_PARAMS --script scripts/update-dexRoot.js --old_contract='DexRootPrev' --new_contract='DexRoot'

npx locklift test $DEFAULT_PARAMS --tests test/30-install-pair-code-v2.js --contract_name='DexPair' --pool_type=1
npx locklift test $DEFAULT_PARAMS --tests test/30-install-pair-code-v2.js --contract_name='DexStablePair' --pool_type=2

npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='qwe' --right='coin' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1
npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='coin' --right='foo' --old_contract_name='DexPairPrev' --new_contract_name='DexPair' --pool_type=1

echo "upgrade_stable.sh END";
