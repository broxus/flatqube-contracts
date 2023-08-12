import { BigNumber } from "bignumber.js";
import { Address } from "locklift";

/**
 * Compares two addresses
 * @param a the first address
 * @param b the second address
 * @return Positive number if a is bigger than b.
 *          Negative number if a is lower than b.
 *          And zero if a equals b
 */
export const addressComparator = (a: Address, b: Address): number =>
  new BigNumber(a.toString().replace(":", "x"))
    .minus(new BigNumber(b.toString().replace(":", "x")))
    .toNumber();

export const addressToDecimal = (a: Address): string =>
  new BigNumber(a.toString().replace(":", "x")).toString(10);

export const isSortedAddresses = (a: Address[]): boolean =>
  a
    .sort(addressComparator)
    .reduce((isSorted, addr, i) => isSorted && addr.equals(a[i]), true);

export const getAccountsByCodeHash = async (
  codeHash: string,
): Promise<Address[]> => {
  let continuation: string | undefined;
  let hasResults: boolean = true;

  const accounts: Address[] = [];

  while (hasResults) {
    const result = await locklift.provider.getAccountsByCodeHash({
      codeHash: codeHash,
      continuation,
      limit: 50,
    });

    continuation = result.continuation;
    hasResults = result.accounts.length === 50;

    accounts.push(...result.accounts);
  }

  return accounts;
};
