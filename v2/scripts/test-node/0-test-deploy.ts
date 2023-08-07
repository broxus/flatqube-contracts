// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts

// for new deploy
// npx locklift run --config locklift.config.ts --network local --script v2/scripts/test-node/0-swaps.ts --new="1"

// only for testing
async function main() {
  await locklift.deployments.fixture({
    include: [
      "owner-account",
      "dex-gas-values",
      "tokens",
      "token-wallets",
      "common-accounts",
      "token-factory",
      "dex-root",
      "dex-accounts",
      "wever",
      "ever-wever-tip3",
      "wever-wallets",
      "wrap-ever",
      "dex-stable",
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
