import BigNumber from "bignumber.js";
import { TOKENS_N, TOKENS_DECIMALS } from "../../utils/consts";
import { deployToken } from "../../utils/deploy.utils";

BigNumber.config({ EXPONENTIAL_AT: 257 });

export default async () => {
  for (let i = 0; i < TOKENS_DECIMALS.length; i++) {
    for (let k = 0; k < TOKENS_N; k++) {
      await deployToken(
        `${TOKENS_DECIMALS[i]}-${k}`,
        `${TOKENS_DECIMALS[i]}-${k}`,
        "1000000",
        TOKENS_DECIMALS[i],
      );
    }
  }
};

export const tag = "tokens";
export const dependencies = ["owner-account"];
