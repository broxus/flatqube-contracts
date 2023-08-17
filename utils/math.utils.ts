import { BigNumber } from "bignumber.js";

// Never return exponential notation for BigNumber
BigNumber.config({ EXPONENTIAL_AT: 1e9 });

/**
 * Converts all BigNumber fields to strings
 * @param obj an object which contains BigNumber fields
 * @return Object where BigNumber fields replaced with strings
 */
export const convertBigNumberValuesToStrings = (obj: any) =>
  Object.keys(obj).reduce((acc: any, key) => {
    acc[key] =
      obj[key] instanceof BigNumber
        ? obj[key].toString(10)
        : new BigNumber(obj[key]).toString(10);
    return acc;
  }, {});

/**
 * Multiplier for fixed-point 128 math operations
 */
export const FIXED_POINT_128_MULTIPLIER = new BigNumber("2").pow("128");

/**
 * Converts value to fixed-point 128 notation
 * @param value BigNumber-like value which must be converted to fixed-point 128 notation
 * @return Value in fixed-point 128 representation
 */
export const convertToFixedPoint128 = (value: string | number) =>
  new BigNumber(value).times(FIXED_POINT_128_MULTIPLIER);

/**
 * Converts fixed-point 128 notation to the standard value
 * @param value BigNumber-like value which must be converted from fixed-point 128 notation
 * @return Value in the standard representation
 */
export const convertFromFixedPoint128 = (value: string | number) =>
  new BigNumber(value).div(FIXED_POINT_128_MULTIPLIER);
