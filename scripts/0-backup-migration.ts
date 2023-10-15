import { Migration } from "../../utils/oldUtils/migration";

const migration = new Migration();

async function main() {
  migration.backup();
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
