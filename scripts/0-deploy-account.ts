import { Command } from "commander";
import { toNano, WalletTypes, getRandomNonce } from "locklift";

const program = new Command();

async function main() {
  program
    .allowUnknownOption()
    .option("-n, --key_number <key_number>", "account's key number")
    .option("-b, --balance <balance>", "account's balance");

  program.parse(process.argv);

  const options = program.opts();

  const key_number = +(options.key_number ?? "0");
  const balance = +(options.balance ?? "10");
  const name = `commonAccount-${key_number + 1}`;

  await locklift.deployments.deployAccounts(
    [
      {
        deploymentName: name,
        accountSettings: {
          type: WalletTypes.EverWallet,
          value: toNano(balance),
          nonce: getRandomNonce(),
        },
        signerId: "0",
      },
    ],
    true,
  );

  const account = locklift.deployments.getAccount(name).account;

  await locklift.provider.sendMessage({
    sender: account.address,
    recipient: account.address,
    amount: toNano(1),
    bounce: false,
  });

  console.log(`${name}: ${account.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
