import { Address, fromNano } from "locklift";
import { broxusEverWallet } from "../giverSettings";
import { ACCOUNTS_N } from "../utils/consts";

const main = async () => {
  await locklift.deployments.load();
  const giverAddress = locklift.context.network.config.giver.address;

  async function getEvers(accountName: string) {
    let account;
    try {
      account = locklift.deployments.getAccount(accountName);
    } catch (e) {
      return;
    }
    const wallet = new locklift.provider.Contract(
      broxusEverWallet,
      account.account.address,
    );
    const balanceBefore = await locklift.provider.getBalance(wallet.address);

    await locklift.transactions.waitFinalized(
      wallet.methods
        .sendTransaction({
          dest: new Address(giverAddress),
          value: 0,
          bounce: false,
          flags: 128,
          payload: "",
        })
        .sendExternal({ publicKey: account.signer.publicKey }),
    );

    const balanceAfter = await locklift.provider.getBalance(wallet.address);

    console.log(
      `[EVER Balance] ${wallet.address.toString()}: ${fromNano(
        balanceBefore,
      )} -> ${fromNano(balanceAfter)}`,
    );
  }

  await getEvers("DexOwner");

  for (let i = 0; i < ACCOUNTS_N; i++) {
    await getEvers(`commonAccount-${i}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
