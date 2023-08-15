import chalk from "chalk";
import { Transaction } from "locklift";

// LOGS

export const displayTx = (_tx: Transaction, describe?: string) => {
  console.log(`txId ${describe ?? ""}: ${_tx.id.hash ? _tx.id.hash : _tx.id}`);
};

/**
 * Prints green success message and exit with 0 status code
 * @param message message about success before exit
 */
export const logAndExitWithSuccess = (message: string): void => {
  console.log(chalk.green(message));
  process.exit(0);
};

/**
 * Prints red error message and exit with 1 status code
 * @param error message about error before exit
 */
export const logAndExitWithError = (error: any): void => {
  console.error(error);
  process.exit(1);
};

export const logMigrationProcess = (
  contract: string,
  method: string,
  message: string,
): void =>
  console.log(
    new Date().toLocaleTimeString(undefined, { hour12: false }),
    "--",
    `${chalk.bold.blue(`[Migration][${contract}][${method}]`)}`,
    chalk.cyan(message),
  );

export const logMigrationSuccess = (
  contract: string,
  method: string,
  message: string,
): void =>
  console.log(
    new Date().toLocaleTimeString(undefined, { hour12: false }),
    "--",
    `${chalk.bold.blue(`[Migration][${contract}][${method}]`)}`,
    chalk.green(message),
    "\n",
  );

export const logTestProcessing = (
  functionName: string,
  message: string,
): void =>
  console.log(
    new Date().toLocaleTimeString(undefined, { hour12: false }),
    "--",
    `${chalk.bold.blue(`[LOG][${functionName}]`)}`,
    chalk.green(message),
    "\n",
  );

export const logSuccess = (
  contract: string,
  method: string,
  message: string,
): void =>
  console.log(
    new Date().toLocaleTimeString(undefined, { hour12: false }),
    "--",
    `${chalk.bold.blue(`[${contract}][${method}]`)}`,
    chalk.green(message),
    "\n",
  );

export const logMigrationParams = (params: Record<string, unknown>): void =>
  console.log(
    new Date().toLocaleTimeString(undefined, { hour12: false }),
    "--",
    "--",
    chalk.bgMagenta("[Params]"),
    JSON.stringify(params),
  );

export const isValidEverAddress = (address: string) =>
  /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);
