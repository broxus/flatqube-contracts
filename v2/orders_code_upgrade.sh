
npx locklift run --config ./locklift.config.ts --disable-build --network main --script v2/scripts/prod/50-export-order-root.ts
npx locklift run --config ./locklift.config.ts --disable-build --network main --script v2/scripts/prod/51-export-order.ts
npx locklift run --config ./locklift.config.ts --disable-build --network main --script v2/scripts/update-order-code.ts
