import { Address, toNano } from "locklift";
import { Migration, displayTx } from "../../utils/migration";

import fs from "fs";

let dexPairs: any[];

const DEX_ROOT_ADDRESS =
  "0:5eb5713ea9b4a0f3a13bc91b282cde809636eb1e68d2fcb6427b9ad78a5a9008";

const data = fs.readFileSync("./dex_fees.json", "utf8");
if (data) dexPairs = JSON.parse(data);

async function main() {
  const migration = new Migration();
  const dexOwner = await migration.loadAccount("Account1", "0");

  const dexRoot = await locklift.factory.getDeployedContract(
    "DexRoot",
    new Address(DEX_ROOT_ADDRESS),
  );

  console.log(`Start upgrade fee params. Count = ${dexPairs.length}`);

  for (const indx in dexPairs) {
    const pairData = dexPairs[indx];
    console.log(
      `${1 + +indx}/${dexPairs.length}: Update fee params for ${
        pairData.title
      }`,
    );
    const tx = await dexRoot.methods
      .setPairFeeParams({
        _roots: pairData.roots,
        _params: pairData.fee,
        _remainingGasTo: dexOwner.address,
      })
      .send({
        from: dexOwner.address,
        amount: toNano(5),
      });
    displayTx(tx);
    console.log(``);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
