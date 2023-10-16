import { Address, Transaction } from "locklift";
import { BigNumber } from "bignumber.js";

export const displayTx = (_tx: Transaction, describe?: string) => {
  console.log(`txId ${describe ?? ""}: ${_tx.id.hash ? _tx.id.hash : _tx.id}`);
};

export const addressComparator = (a: Address, b: Address): number =>
  new BigNumber(a.toString().replace(":", "x"))
    .minus(new BigNumber(b.toString().replace(":", "x")))
    .toNumber();

export const isValidEverAddress = (address: string) =>
  /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);
