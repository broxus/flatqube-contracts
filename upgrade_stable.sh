echo "upgrade_stable.sh START";

#export DEFAULT_PARAMS="--config locklift.config.js --disable-build --network local"
export DEFAULT_PARAMS="--config locklift.config.js --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
export NO_TRACE="--config locklift.config.js --disable-build --network local"

npx locklift test $DEFAULT_PARAMS --tests test/30-install-pair-code-v2.js --contract_name='DexStablePair' --pool_type=2

npx locklift test $NO_TRACE --tests test/35-upgrade-pair.js --left='foo' --right='bar' --old_contract_name='DexPair' --new_contract_name='DexStablePair' --pool_type=2

echo "upgrade_stable.sh END";
