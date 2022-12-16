export DEFAULT_PARAMS="--config ./locklift.config.ts --disable-build --enable-tracing --external-build node_modules/tip3/build --network mainnet"
export NO_TRACE="--config ./locklift.config.ts --disable-build --network local"
export NO_TRACE_MAIN="--config ./locklift.config.ts --disable-build --network mainnet"

npx locklift run $NO_TRACE_MAIN --script v2/scripts/0-reset-migration.ts
npx locklift run $NO_TRACE_MAIN --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='5'
npx locklift run $NO_TRACE_MAIN --script v2/scripts/prod/deploy-factory-order.ts
