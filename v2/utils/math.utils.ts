import { ViewTracingTree } from 'locklift/internal/tracing/viewTraceTree/viewTracingTree';
import { ViewTraceTree } from 'locklift/src/internal/tracing/types';
import { Address, TraceType, DecodedAbiFunctionOutputs } from 'locklift';
import logger from 'mocha-logger-ts';
import BigNumber from 'bignumber.js';

import { Constants } from './migration';
import {
  DexPairAbi,
  DexStablePoolAbi,
  FactorySource,
} from '../../build/factorySource';

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

type ExpectedDeposit = DecodedAbiFunctionOutputs<
  DexPairAbi,
  'expectedDepositLiquidity'
>['value0'];

type ExpectedDepositV2 = DecodedAbiFunctionOutputs<
  DexStablePoolAbi,
  'expectedDepositLiquidityV2'
>['value0'];

function logExpectedDepositV2(
  expected: ExpectedDepositV2,
  tokens: { decimals: number; symbol: string }[],
) {
  const N_COINS = tokens.length;

  logger.log(`Deposit: `);

  for (let i = 0; i < N_COINS; i++) {
    if (new BigNumber(expected.amounts[i]).gt(0)) {
      logger.log(
        `    ` +
          `${new BigNumber(expected.amounts[i])
            .shiftedBy(-tokens[i].decimals)
            .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
      );
    }
  }

  logger.log(`Expected LP reward:`);
  logger.log(
    `${new BigNumber(expected.lp_reward)
      .shiftedBy(-Constants.LP_DECIMALS)
      .toFixed(Constants.LP_DECIMALS)}`,
  );

  logger.log(`Fees: `);

  for (let i = 0; i < N_COINS; i++) {
    if (new BigNumber(expected.pool_fees[i]).gt(0)) {
      logger.log(
        `     Pool fee ` +
          `${new BigNumber(expected.pool_fees[i])
            .shiftedBy(-tokens[i].decimals)
            .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
      );
    }
    if (new BigNumber(expected.beneficiary_fees[i]).gt(0)) {
      logger.log(
        `     DAO fee ` +
          `${new BigNumber(expected.beneficiary_fees[i])
            .shiftedBy(-tokens[i].decimals)
            .toFixed(tokens[i].decimals)} ${tokens[i].symbol}`,
      );
    }
  }

  logger.log(` ---DEBUG--- `);
  logger.log(`Invariant: ${expected.invariant}`);

  for (let i = 0; i < N_COINS; i++) {
    logger.log(`${tokens[i].symbol}:`);
    logger.log(
      `     old_balances: ` +
        `${new BigNumber(expected.old_balances[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     result_balances: ` +
        `${new BigNumber(expected.result_balances[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     old_balances: ` +
        `${new BigNumber(expected.old_balances[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     change: ` +
        `${new BigNumber(expected.result_balances[i])
          .minus(expected.old_balances[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     differences: ` +
        `${new BigNumber(expected.differences[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     pool_fees: ` +
        `${new BigNumber(expected.pool_fees[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(
      `     beneficiary_fees: ` +
        `${new BigNumber(expected.beneficiary_fees[i])
          .shiftedBy(-tokens[i].decimals)
          .toFixed(tokens[i].decimals)}`,
    );
    logger.log(`     sell: ${expected.sell[i]}`);
  }
}

function logExpectedDeposit(
  expected: ExpectedDeposit,
  tokens: { decimals: number }[],
) {
  const left_decimals = tokens[0].decimals;
  const right_decimals = tokens[1].decimals;

  logger.log(`Expected result: `);

  if (new BigNumber(expected.step_1_lp_reward).isZero()) {
    logger.log(`    Step 1: skipped`);
  } else {
    logger.log(`    Step 1: `);
    logger.log(
      `        Left deposit = ${new BigNumber(expected.step_1_left_deposit)
        .shiftedBy(-left_decimals)
        .toFixed(left_decimals)}`,
    );
    logger.log(
      `        Right deposit = ${new BigNumber(expected.step_1_right_deposit)
        .shiftedBy(-right_decimals)
        .toFixed(right_decimals)}`,
    );
    logger.log(
      `        LP reward = ${new BigNumber(expected.step_1_lp_reward)
        .shiftedBy(-Constants.LP_DECIMALS)
        .toFixed(Constants.LP_DECIMALS)}`,
    );
  }

  if (expected.step_2_left_to_right) {
    logger.log(`    Step 2: `);
    logger.log(
      `        Left amount for change = ${new BigNumber(expected.step_2_spent)
        .shiftedBy(-left_decimals)
        .toFixed(left_decimals)}`,
    );
    logger.log(
      `        Left fee = ${new BigNumber(expected.step_2_fee)
        .shiftedBy(-left_decimals)
        .toFixed(left_decimals)}`,
    );
    logger.log(
      `        Right received amount = ${new BigNumber(expected.step_2_received)
        .shiftedBy(-right_decimals)
        .toFixed(right_decimals)}`,
    );
  } else if (expected.step_2_right_to_left) {
    logger.log(`    Step 2: `);
    logger.log(
      `        Right amount for change = ${new BigNumber(expected.step_2_spent)
        .shiftedBy(-right_decimals)
        .toFixed(right_decimals)}`,
    );
    logger.log(
      `        Right fee = ${new BigNumber(expected.step_2_fee)
        .shiftedBy(-right_decimals)
        .toFixed(right_decimals)}`,
    );
    logger.log(
      `        Left received amount = ${new BigNumber(expected.step_2_received)
        .shiftedBy(-left_decimals)
        .toFixed(left_decimals)}`,
    );
  } else {
    logger.log(`    Step 2: skipped`);
  }

  if (new BigNumber(expected.step_3_lp_reward).isZero()) {
    logger.log(`    Step 3: skipped`);
  } else {
    logger.log(`    Step 3: `);
    logger.log(
      `        Left deposit = ${new BigNumber(expected.step_3_left_deposit)
        .shiftedBy(-left_decimals)
        .toFixed(left_decimals)}`,
    );
    logger.log(
      `        Right deposit = ${new BigNumber(expected.step_3_right_deposit)
        .shiftedBy(-right_decimals)
        .toFixed(right_decimals)}`,
    );
    logger.log(
      `        LP reward = ${new BigNumber(expected.step_3_lp_reward)
        .shiftedBy(-Constants.LP_DECIMALS)
        .toFixed(Constants.LP_DECIMALS)}`,
    );
  }

  logger.log(`    TOTAL: `);
  logger.log(
    `        LP reward = ${new BigNumber(expected.step_1_lp_reward)
      .plus(expected.step_3_lp_reward)
      .shiftedBy(-Constants.LP_DECIMALS)
      .toFixed(Constants.LP_DECIMALS)}`,
  );
}

export async function expectedDepositLiquidity(
  pairAddress: Address,
  contractName: keyof FactorySource,
  tokens: { decimals: number; symbol: string }[],
  amounts: (string | number)[],
  autoChange: boolean,
) {
  const pair = locklift.factory.getDeployedContract(contractName, pairAddress);

  let LP_REWARD: string;

  if (
    contractName === 'DexStablePair' ||
    contractName === 'DexStablePool' ||
    contractName === 'DexStablePoolPrev'
  ) {
    const expected = await pair.methods
      .expectedDepositLiquidityV2({ answerId: 0, amounts })
      .call()
      .then((r) => r.value0);

    LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

    logExpectedDepositV2(expected, tokens);
  } else {
    const expected = await pair.methods
      .expectedDepositLiquidity({
        answerId: 0,
        left_amount: amounts[0],
        right_amount: amounts[1],
        auto_change: autoChange,
      })
      .call()
      .then((r) => r.value0);

    LP_REWARD = new BigNumber(expected.step_1_lp_reward)
      .plus(expected.step_3_lp_reward)
      .shiftedBy(-9)
      .toString();

    logExpectedDeposit(expected, tokens);
  }

  return LP_REWARD;
}
