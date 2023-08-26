import { ViewTracingTree } from "locklift/internal/tracing/viewTraceTree/viewTracingTree";
import { ViewTraceTree } from "locklift/src/internal/tracing/types";
import { Address, TraceType, Contract } from "locklift";
// import logger from "mocha-logger-ts";
import BigNumber from "bignumber.js";

// import { Constants } from "utils/consts";
import {
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
} from "build/factorySource";
import { ITokens } from "utils/wrappers";
import { addressComparator } from "./helpers";

export interface IDepositLiquidity {
  lpReward: string;
  poolFees: Record<string, string>;
  beneficiaryFees: Record<string, string>;
  referrerFees: Record<string, string>;
  amounts: Record<string, string>;
}

export function calculateMaxCWi(traceTree: ViewTracingTree) {
  function calculateCwi(viewTraceTree: ViewTraceTree, currentCWi: number) {
    const CW_arr: number[] = [];
    const traces = viewTraceTree.outTraces.filter(
      (trace: ViewTraceTree) =>
        trace.type !== TraceType.FUNCTION_RETURN &&
        trace.type !== TraceType.EVENT &&
        trace.type !== TraceType.EVENT_OR_FUNCTION_RETURN,
    );

    for (const trace of traces) {
      CW_arr.push(calculateCwi(trace, traces.length * currentCWi));
    }

    return Math.max(currentCWi, ...CW_arr);
  }

  return calculateCwi(traceTree.viewTraceTree, 1);
}

// todo: its doesnt using anywhere currently, possibly need to remove
// type ExpectedDeposit = DecodedAbiFunctionOutputs<
//   DexPairAbi,
//   "expectedDepositLiquidity"
// >["value0"];
//
// type ExpectedDepositV2 = DecodedAbiFunctionOutputs<
//   DexStablePoolAbi,
//   "expectedDepositLiquidityV2"
// >["value0"];

// function logExpectedDepositV2(
//   expected: ExpectedDepositV2,
//   tokens: { decimals: number; symbol: string }[],
// ) {
//   const N_COINS = tokens.length;
//
//   logger.log(`Deposit: `);
//
//   for (let i = 0; i < N_COINS; i++) {
//     if (new BigNumber(expected.amounts[i]).gt(0)) {
//       logger.log(
//         `    ` +
//           `${new BigNumber(expected.amounts[i])
//             .shiftedBy(-tokens[i].decimals)
//             .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
//       );
//     }
//   }
//
//   logger.log(`Expected LP reward:`);
//   logger.log(
//     `${new BigNumber(expected.lp_reward)
//       .shiftedBy(-Constants.LP_DECIMALS)
//       .toFixed(Constants.LP_DECIMALS)}`,
//   );
//
//   logger.log(`Fees: `);
//
//   for (let i = 0; i < N_COINS; i++) {
//     if (new BigNumber(expected.pool_fees[i]).gt(0)) {
//       logger.log(
//         `     Pool fee ` +
//           `${new BigNumber(expected.pool_fees[i])
//             .shiftedBy(-tokens[i].decimals)
//             .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
//       );
//     }
//     if (new BigNumber(expected.beneficiary_fees[i]).gt(0)) {
//       logger.log(
//         `     DAO fee ` +
//           `${new BigNumber(expected.beneficiary_fees[i])
//             .shiftedBy(-tokens[i].decimals)
//             .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
//       );
//     }
//   }
//
//   logger.log(` ---DEBUG--- `);
//   logger.log(`Invariant: ${expected.invariant}`);
//
//   for (let i = 0; i < N_COINS; i++) {
//     logger.log(`${tokens[i].symbol}:`);
//     logger.log(
//       `     old_balances: ` +
//         `${new BigNumber(expected.old_balances[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     result_balances: ` +
//         `${new BigNumber(expected.result_balances[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     old_balances: ` +
//         `${new BigNumber(expected.old_balances[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     change: ` +
//         `${new BigNumber(expected.result_balances[i])
//           .minus(expected.old_balances[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     differences: ` +
//         `${new BigNumber(expected.differences[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     pool_fees: ` +
//         `${new BigNumber(expected.pool_fees[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(
//       `     beneficiary_fees: ` +
//         `${new BigNumber(expected.beneficiary_fees[i])
//           .shiftedBy(-tokens[i].decimals)
//           .toFixed(tokens[i].decimals)}`,
//     );
//     logger.log(`     sell: ${expected.sell[i]}`);
//   }
// }
//
// function logExpectedDeposit(
//   expected: ExpectedDeposit,
//   tokens: { decimals: number }[],
// ) {
//   const left_decimals = tokens[0].decimals;
//   const right_decimals = tokens[1].decimals;
//
//   logger.log(`Expected result: `);
//
//   if (new BigNumber(expected.step_1_lp_reward).isZero()) {
//     logger.log(`    Step 1: skipped`);
//   } else {
//     logger.log(`    Step 1: `);
//     logger.log(
//       `        Left deposit = ${new BigNumber(expected.step_1_left_deposit)
//         .shiftedBy(-left_decimals)
//         .toFixed(left_decimals)}`,
//     );
//     logger.log(
//       `        Right deposit = ${new BigNumber(expected.step_1_right_deposit)
//         .shiftedBy(-right_decimals)
//         .toFixed(right_decimals)}`,
//     );
//     logger.log(
//       `        LP reward = ${new BigNumber(expected.step_1_lp_reward)
//         .shiftedBy(-Constants.LP_DECIMALS)
//         .toFixed(Constants.LP_DECIMALS)}`,
//     );
//   }
//
//   if (expected.step_2_left_to_right) {
//     logger.log(`    Step 2: `);
//     logger.log(
//       `        Left amount for change = ${new BigNumber(expected.step_2_spent)
//         .shiftedBy(-left_decimals)
//         .toFixed(left_decimals)}`,
//     );
//     logger.log(
//       `        Left fee = ${new BigNumber(expected.step_2_fee)
//         .shiftedBy(-left_decimals)
//         .toFixed(left_decimals)}`,
//     );
//     logger.log(
//       `        Right received amount = ${new BigNumber(expected.step_2_received)
//         .shiftedBy(-right_decimals)
//         .toFixed(right_decimals)}`,
//     );
//   } else if (expected.step_2_right_to_left) {
//     logger.log(`    Step 2: `);
//     logger.log(
//       `        Right amount for change = ${new BigNumber(expected.step_2_spent)
//         .shiftedBy(-right_decimals)
//         .toFixed(right_decimals)}`,
//     );
//     logger.log(
//       `        Right fee = ${new BigNumber(expected.step_2_fee)
//         .shiftedBy(-right_decimals)
//         .toFixed(right_decimals)}`,
//     );
//     logger.log(
//       `        Left received amount = ${new BigNumber(expected.step_2_received)
//         .shiftedBy(-left_decimals)
//         .toFixed(left_decimals)}`,
//     );
//   } else {
//     logger.log(`    Step 2: skipped`);
//   }
//
//   if (new BigNumber(expected.step_3_lp_reward).isZero()) {
//     logger.log(`    Step 3: skipped`);
//   } else {
//     logger.log(`    Step 3: `);
//     logger.log(
//       `        Left deposit = ${new BigNumber(expected.step_3_left_deposit)
//         .shiftedBy(-left_decimals)
//         .toFixed(left_decimals)}`,
//     );
//     logger.log(
//       `        Right deposit = ${new BigNumber(expected.step_3_right_deposit)
//         .shiftedBy(-right_decimals)
//         .toFixed(right_decimals)}`,
//     );
//     logger.log(
//       `        LP reward = ${new BigNumber(expected.step_3_lp_reward)
//         .shiftedBy(-Constants.LP_DECIMALS)
//         .toFixed(Constants.LP_DECIMALS)}`,
//     );
//   }
//
//   logger.log(`    TOTAL: `);
//   logger.log(
//     `        LP reward = ${new BigNumber(expected.step_1_lp_reward)
//       .plus(expected.step_3_lp_reward)
//       .shiftedBy(-Constants.LP_DECIMALS)
//       .toFixed(Constants.LP_DECIMALS)}`,
//   );
// }

export async function expectedDepositLiquidity(
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
  tokens: ITokens[],
  autoChange: boolean,
  isReferrer?: boolean,
): Promise<IDepositLiquidity> {
  const poolType = await poolContract.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => Number(a.value0));

  // prevent mutation of the original array
  const sortedTokens = [...tokens].sort((a, b) =>
    addressComparator(a.root, b.root),
  );

  // stablePair or stablePool
  if ([2, 3].includes(poolType)) {
    const expected = await (poolContract as Contract<DexStablePairAbi>).methods
      .expectedDepositLiquidityV2({
        answerId: 0,
        amounts: sortedTokens.map(a => a.amount),
      })
      .call()
      .then(r => r.value0);

    const beneficiaryFees: Record<string, string> = {};
    const poolFees: Record<string, string> = {};
    const referrerFees: Record<string, string> = {};

    for (let i = 0; i < sortedTokens.length; i++) {
      const { beneficiaryFee, poolFee, referrerFee } =
        await getFeesFromTotalFee(
          poolContract,
          new BigNumber(expected.beneficiary_fees[i])
            .plus(expected.pool_fees[i])
            .toString(),
          isReferrer,
        );
      beneficiaryFees[sortedTokens[i].root.toString()] = beneficiaryFee;
      poolFees[sortedTokens[i].root.toString()] = poolFee;
      referrerFees[sortedTokens[i].root.toString()] = referrerFee;
    }

    const amounts: Record<string, string> = {};
    expected.amounts.forEach(
      (a, i) => (amounts[sortedTokens[i].root.toString()] = a),
    );

    return {
      lpReward: expected.lp_reward,
      beneficiaryFees,
      poolFees,
      referrerFees,
      amounts,
    };
  }

  // pair
  if (poolType === 1) {
    const expectedLiq = await (poolContract as Contract<DexPairAbi>).methods
      .expectedDepositLiquidity({
        answerId: 0,
        left_amount: sortedTokens[0].amount,
        right_amount: sortedTokens[1].amount,
        auto_change: autoChange,
      })
      .call()
      .then(r => r.value0);

    const { beneficiaryFee, poolFee, referrerFee } = await getFeesFromTotalFee(
      poolContract,
      expectedLiq.step_2_fee,
      isReferrer,
    );

    let leftAmount = new BigNumber(expectedLiq.step_1_left_deposit).toString();
    let rightAmount = new BigNumber(
      expectedLiq.step_1_right_deposit,
    ).toString();

    if (expectedLiq.step_2_left_to_right) {
      leftAmount = new BigNumber(leftAmount)
        .plus(expectedLiq.step_2_spent)
        .plus(expectedLiq.step_3_left_deposit)
        .toString();
    } else if (expectedLiq.step_2_right_to_left) {
      rightAmount = new BigNumber(rightAmount)
        .plus(expectedLiq.step_2_spent)
        .plus(expectedLiq.step_3_right_deposit)
        .toString();
    }

    return {
      lpReward: new BigNumber(expectedLiq.step_1_lp_reward)
        .plus(expectedLiq.step_3_lp_reward)
        .toString(),
      beneficiaryFees: Object.fromEntries([
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[0].root.toString()
            : sortedTokens[1].root.toString(),
          beneficiaryFee,
        ],
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[1].root.toString()
            : sortedTokens[0].root.toString(),
          0,
        ],
      ]),
      poolFees: Object.fromEntries([
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[0].root.toString()
            : sortedTokens[1].root.toString(),
          poolFee,
        ],
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[1].root.toString()
            : sortedTokens[0].root.toString(),
          0,
        ],
      ]),
      referrerFees: Object.fromEntries([
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[0].root.toString()
            : sortedTokens[1].root.toString(),
          referrerFee,
        ],
        [
          expectedLiq.step_2_left_to_right
            ? sortedTokens[1].root.toString()
            : sortedTokens[0].root.toString(),
          0,
        ],
      ]),
      amounts: Object.fromEntries([
        [sortedTokens[0].root.toString(), leftAmount],
        [sortedTokens[1].root.toString(), rightAmount],
      ]),
    };
  }
}

export async function expectedExchange(
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
  amount: string | number,
  spent_token_root: Address,
  receive_token_root?: Address,
  isReferrer?: boolean,
) {
  const poolType = await poolContract.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => Number(a.value0));

  const expected =
    poolType === 3 // stablePool
      ? await poolContract.methods
          .expectedExchange({
            answerId: 0,
            amount,
            spent_token_root,
            receive_token_root,
          })
          .call()
      : await (poolContract as Contract<DexPairAbi>).methods // pair, stablePair
          .expectedExchange({
            answerId: 0,
            amount,
            spent_token_root,
          })
          .call();

  const { beneficiaryFee, poolFee, referrerFee } = await getFeesFromTotalFee(
    poolContract,
    expected.expected_fee,
    isReferrer,
  );

  return {
    receivedAmount: expected.expected_amount,
    beneficiaryFee,
    poolFee,
    referrerFee,
  };
}

export async function getFeesFromTotalFee(
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
  totalFee: string,
  isReferrer: boolean,
) {
  const feesData = await poolContract.methods
    .getFeeParams({ answerId: 0 })
    .call()
    .then(r => r.value0);

  if (isReferrer) {
    const numerator = new BigNumber(feesData.pool_numerator)
      .plus(feesData.beneficiary_numerator)
      .plus(feesData.referrer_numerator);

    const referrerFee = new BigNumber(totalFee)
      .times(feesData.referrer_numerator)
      .div(numerator)
      .dp(0, BigNumber.ROUND_CEIL)
      .toString();
    const poolFee = new BigNumber(totalFee)
      .times(feesData.pool_numerator)
      .div(numerator)
      .dp(0, BigNumber.ROUND_CEIL)
      .toString();
    const beneficiaryFee = new BigNumber(totalFee)
      .minus(referrerFee)
      .minus(poolFee)
      .toString();

    return { beneficiaryFee, poolFee, referrerFee };
  }

  const numerator = new BigNumber(feesData.pool_numerator).plus(
    feesData.beneficiary_numerator,
  );

  const poolFee = new BigNumber(totalFee)
    .times(feesData.pool_numerator)
    .div(numerator)
    .dp(0, BigNumber.ROUND_CEIL)
    .toString();
  const beneficiaryFee = new BigNumber(totalFee).minus(poolFee).toString();

  return { beneficiaryFee, poolFee, referrerFee: "0" };
}

export async function expectedWithdrawLiquidity(
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
  lpAmount: string,
) {
  // todo types
  const tokenRoots: any = await poolContract.methods
    .getTokenRoots({ answerId: 0 })
    .call();

  const expected: any = await poolContract.methods
    .expectedWithdrawLiquidity({
      answerId: 0,
      lp_amount: lpAmount,
    })
    .call();

  const amounts: Record<string, string> = {};
  if (expected.hasOwnProperty("expected_left_amount")) {
    amounts[tokenRoots.left.toString()] = expected.expected_left_amount;
    amounts[tokenRoots.right.toString()] = expected.expected_right_amount;
  } else {
    expected.value0.amounts.forEach(
      (a: string, i: number) => (amounts[tokenRoots.roots[i].toString()] = a),
    );
  }

  return { amounts };
}

export async function expectedWithdrawLiquidityOneCoin(
  poolContract: Contract<DexStablePoolAbi>,
  lpAmount: string,
  receivedToken: Address,
  isReferrer?: boolean,
) {
  const expected = await poolContract.methods
    .expectedWithdrawLiquidityOneCoin({
      answerId: 0,
      lp_amount: lpAmount,
      outcoming: receivedToken,
    })
    .call();

  const receivedAmount = expected.value0.amounts.find(a => a !== "0") || "0";
  const benFee = expected.value0.beneficiary_fees.find(a => a !== "0") || "0";
  const pFee = expected.value0.pool_fees.find(a => a !== "0") || "0";

  const { beneficiaryFee, poolFee, referrerFee } = await getFeesFromTotalFee(
    poolContract,
    new BigNumber(benFee).plus(pFee).toString(),
    isReferrer,
  );

  return { receivedAmount, beneficiaryFee, poolFee, referrerFee };
}

export async function expectedDepositLiquidityOneCoin(
  poolContract: Contract<DexStablePoolAbi>,
  amount: string,
  spentToken: Address,
  isReferrer?: boolean,
) {
  const expected = await poolContract.methods
    .expectedDepositLiquidityOneCoin({
      answerId: 0,
      amount: amount,
      spent_token_root: spentToken,
    })
    .call();

  const lpReward = expected.value0.lp_reward;
  const benFee = expected.value0.beneficiary_fees.find(a => a !== "0") || 0;
  const pFee = expected.value0.pool_fees.find(a => a !== "0") || 0;

  const { beneficiaryFee, poolFee, referrerFee } = await getFeesFromTotalFee(
    poolContract,
    new BigNumber(benFee).plus(pFee).toString(),
    isReferrer,
  );

  return { lpReward, beneficiaryFee, poolFee, referrerFee };
}
