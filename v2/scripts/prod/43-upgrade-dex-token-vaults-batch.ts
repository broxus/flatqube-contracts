import { Address, toNano, WalletTypes } from 'locklift';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { displayTx, Migration } from '../../utils/migration';
import { yellowBright } from 'chalk';
import tokenVaults from '../../../dex_token_vaults.json';

const TRACE = false;

const chunkify = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size),
  );

const main = async () => {
  const migration = new Migration();

  const dexRoot = migration.loadContract('DexRoot', 'DexRoot');

  const dexManagerAddress = await dexRoot.methods
    .getManager({ answerId: 0 })
    .call()
    .then((m) => m.value0);

  const manager = await locklift.factory.accounts.addExistingAccount({
    type: WalletTypes.EverWallet,
    address: dexManagerAddress,
  });

  console.log('DexRoot:' + dexRoot.address);
  console.log('Manager:' + manager.address);

  console.log(`Start upgrade DexTokenVaults. Count = ${tokenVaults.length}`);

  const params = tokenVaults.map((p) => ({
    tokenRoot: new Address(p.tokenRoot),
    tokenVault: new Address(p.tokenVault),
  }));

  for (const chunk of chunkify(params, 1000)) {
    const p = dexRoot.methods
      .upgradeTokenVaults({
        _tokenRoots: chunk.map((p) => p.tokenRoot),
        _offset: 0,
        _remainingGasTo: manager.address,
      })
      .send({
        from: manager.address,
        amount: toNano(chunk.length * 5),
      });

    if (TRACE) {
      const { traceTree } = await locklift.tracing.trace(p);

      //await traceTree.beautyPrint();

      for (const tokenVault of chunk) {
        const DexTokenVault = locklift.factory.getDeployedContract(
          'DexTokenVault',
          tokenVault.tokenVault,
        );

        const events = traceTree.findEventsForContract({
          contract: DexTokenVault,
          name: 'TokenVaultCodeUpgraded' as const,
        });

        if (events.length > 0) {
          console.log(
            `DexTokenVault ${tokenVault.tokenVault} for token ${tokenVault.tokenRoot} upgraded. Current version: ${events[0].currentVersion}`,
          );
        } else {
          console.log(
            yellowBright(
              `DexTokenVault ${tokenVault.tokenVault} wasn't upgraded`,
            ),
          );
        }
      }
    } else {
      const tx = await locklift.transactions.waitFinalized(p);
      displayTx(tx.transactions[0]);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
