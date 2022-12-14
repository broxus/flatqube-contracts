#export DEFAULT_PARAMS="--config ./locklift.config.ts --disable-build --enable-tracing --external-build node_modules/tip3/build --network local"
#export NO_TRACE="--config ./locklift.config.ts --disable-build --network local"

#npx locklift run $NO_TRACE --script v2/scripts/0-reset-migration.ts
#npx locklift run $NO_TRACE --script v2/scripts/0-deploy-account.ts --key_number='0' --balance='50'

# upgrade dexRoot
# set Account1 as manager
# upgrade dexVault
# install DexVaultLpTokenPending

# set dexRoot to migrations

#npx locklift run $NO_TRACE --script v2/scripts/hardcode-manager-address.ts
#npx locklift build
#npx locklift run $NO_TRACE --script v2/scripts/withdraw-lp-tokens.ts

#npx locklift run $NO_TRACE --script v2/scripts/prod/export-dex-pairs.ts
#npx locklift run $NO_TRACE --script v2/scripts/prod/upgrade-dex-pairs.ts

# upgrade stable pairs

#npx locklift run $NO_TRACE --script v2/scripts/prod/export-dex-accounts.ts
#npx locklift run $NO_TRACE --script v2/scripts/prod/force-upgrade-dex-accounts.ts

