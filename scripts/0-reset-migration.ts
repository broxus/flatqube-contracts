import { Migration } from "../../utils/oldUtils/migration";

async function main() {
  const migration = new Migration();
  migration.reset();
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
