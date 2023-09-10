import { displayTx } from "../../../utils/helpers";

import fs from "fs";
import { setPairFeeParams } from "../../../utils/wrappers";

let dexPairs: any[];

const data = fs.readFileSync("./dex_fees.json", "utf8");
if (data) dexPairs = JSON.parse(data);

async function main() {
  await locklift.deployments.load();

  console.log(`Start upgrade fee params. Count = ${dexPairs.length}`);

  for (const indx in dexPairs) {
    const pairData = dexPairs[indx];
    console.log(
      `${1 + +indx}/${dexPairs.length}: Update fee params for ${
        pairData.title
      }`,
    );
    const tx = await setPairFeeParams(pairData.roots, pairData.fee);
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
