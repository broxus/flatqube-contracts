const fs = require('fs');

const logger = require('mocha-logger');

const TOKEN_CONTRACTS_PATH = 'node_modules/tip3/build'
const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});

const getRandomNonce = () => Math.random() * 64000 | 0;

const stringToBytesArray = (dataString) => {
  return Buffer.from(dataString).toString('hex')
};

const displayAccount = async (contract) => {
  return (
    `Account.${contract.name}${contract.index !== undefined ? '#' + contract.index : ''}` +
    `(address="${contract.address}" balance=${await getBalance(contract)})`
  )
};

const getBalance = async (contract) => {
  return locklift.utils.convertCrystal((await locklift.ton.getBalance(contract.address)), 'ton').toNumber();
}

async function sleep(ms) {
  ms = ms === undefined ? 1000 : ms;
  return new Promise(resolve => setTimeout(resolve, ms));
}

const afterRun = async (tx) => {
   await new Promise(resolve => setTimeout(resolve, 3000));
};

const displayTx = (_tx) => {
  if(locklift.tracing) {
    console.log(`txId: ${_tx.id.hash ? _tx.id.hash : _tx.id}`);
  } else {
    console.log(`txId: ${_tx.transaction.id.hash ? _tx.transaction.id.hash : _tx.transaction.id}`);
  }
};

const gasPrice = 1000;
const calcValue = (gas) => {
  return new BigNumber(gas.dynamicGas).plus(100000).times(gasPrice).plus(gas.fixedValue).toNumber()
}

const Constants = {
  tokens: {
    foo: {
      name: 'Foo',
      symbol: 'Foo',
      decimals: 6,
      upgradeable: true
    },
    bar: {
      name: 'Bar',
      symbol: 'Bar',
      decimals: 6,
      upgradeable: true
    },
    qwe: {
      name: 'QWE',
      symbol: 'Qwe',
      decimals: 18,
      upgradeable: true
    },
    tst: {
      name: 'Tst',
      symbol: 'Tst',
      decimals: 9,
      upgradeable: true
    },
    coin: {
      name: 'Coin',
      symbol: 'Coin',
      decimals: 9,
      upgradeable: true
    },
    wever: {
      name: 'Wrapped EVER',
      symbol: 'WEVER',
      decimals: 9,
      upgradeable: true
    }
  },
  LP_DECIMALS: 9,

  TESTS_TIMEOUT: 120000
}

for (let i = 0; i < 20; i++) {
  Constants.tokens['gen' + i] = {
    name: 'Gen' + i,
    symbol: 'GEN' + i,
    decimals: 9,
    upgradeable: true
  };
}

class Migration {
  constructor(log_path = 'migration-log.json') {
    this.log_path = log_path;
    this.migration_log = {};
    this.balance_history = [];
    this._loadMigrationLog();
  }

  _loadMigrationLog() {
    if (fs.existsSync(this.log_path)) {
      const data = fs.readFileSync(this.log_path, 'utf8');
      if (data) this.migration_log = JSON.parse(data);
    }
  }

  reset() {
    this.migration_log = {};
    this.balance_history = [];
    this._saveMigrationLog();
  }

  _saveMigrationLog() {
    fs.writeFileSync(this.log_path, JSON.stringify(this.migration_log));
  }

  backup() {
    fs.writeFileSync("migration-log-" + (new Date().getTime()) + ".json", JSON.stringify(this.migration_log));
  }

  exists(alias) {
    return this.migration_log[alias] !== undefined;
  }

  load(contract, alias) {
    if (this.migration_log[alias] !== undefined) {
      contract.setAddress(this.migration_log[alias].address);
    } else {
      throw new Error(`Contract ${alias} not found in the migration`);
    }
    return contract;
  }

  getAddressesByName(name) {
    const r = [];
    for (let alias in this.migration_log) {
      if (this.migration_log[alias].name === name) {
        r.push(this.migration_log[alias].address);
      }
    }
    return r;
  }

  getAddress(alias) {
    if (this.migration_log[alias] !== undefined) {
      const { Address } = require('locklift');
      return new Address(this.migration_log[alias].address);
    } else {
      throw new Error(`Contract ${alias} not found in the migration`);
    }
  }

  store(contract, alias) {
    this.migration_log = {
      ...this.migration_log,
      [alias]: {
        address: contract.address,
        name: contract.name
      }
    }
    this._saveMigrationLog();
  }

  async balancesCheckpoint() {
    const b = {};
    for (let alias in this.migration_log) {
      await locklift.ton.getBalance(this.migration_log[alias].address)
          .then(e => b[alias] = e.toString())
          .catch(e => { /* ignored */ });
    }
    this.balance_history.push(b);
  }

  async balancesLastDiff() {
    const d = {};
    for (let alias in this.migration_log) {
      const start = this.balance_history[this.balance_history.length - 2][alias];
      const end = this.balance_history[this.balance_history.length - 1][alias];
      if (end !== start) {
        const change = new BigNumber(end).minus(start || 0).shiftedBy(-9);
        d[alias] = change;
      }
    }
    return d;
  }

  async logGas() {
    await this.balancesCheckpoint();
    const diff = await this.balancesLastDiff();
    if (diff) {
      logger.log(`### GAS STATS ###`);
      for (let alias in diff) {
        logger.log(`${alias}: ${diff[alias].gt(0) ? '+' : ''}${diff[alias].toFixed(9)} EVER`);
      }
    }
  }
}

function logExpectedDepositV2(expected, tokens) {
  let N_COINS = tokens.length;
  logger.log(`Deposit: `);
  for (var i = 0; i < N_COINS; i++) {
    if (new BigNumber(expected.amounts[i]).gt(0)) {
      logger.log(
        `    ` +
        `${expected.amounts[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)} ${tokens[i].symbol}`
      );
    }
  }
  logger.log(`Expected LP reward:`);
  logger.log(`${expected.lp_reward.shiftedBy(-Constants.LP_DECIMALS).toFixed(Constants.LP_DECIMALS)}`);

  logger.log(`Fees: `);
  for (var i = 0; i < N_COINS; i++) {
    if (new BigNumber(expected.pool_fees[i]).gt(0)) {
      logger.log(`     Pool fee ` +
          `${expected.pool_fees[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)} ${tokens[i].symbol}`);
    }
    if (new BigNumber(expected.beneficiary_fees[i]).gt(0)) {
    logger.log(`     DAO fee ` +
        `${expected.beneficiary_fees[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)} ${tokens[i].symbol}`);
    }
  }
  logger.log(` ---DEBUG--- `);
  logger.log(`Invariant: ${expected.invariant}`);
  for (var i = 0; i < N_COINS; i++) {
    logger.log(`${tokens[i].symbol}:`);
    logger.log(`     old_balances: ` +
        `${expected.old_balances[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     result_balances: ` +
        `${expected.result_balances[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     old_balances: ` +
        `${expected.old_balances[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     change: ` +
        `${expected.result_balances[i].minus(expected.old_balances[i]).shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     differences: ` +
        `${expected.differences[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     pool_fees: ` +
        `${expected.pool_fees[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     beneficiary_fees: ` +
        `${expected.beneficiary_fees[i].shiftedBy(-tokens[i].decimals).toFixed(tokens[i].decimals)}`);
    logger.log(`     sell: ${expected.sell[i]}`);
  }
}

function logExpectedDeposit(expected, tokens) {

  const left_decimals = tokens[0].decimals;
  const right_decimals = tokens[1].decimals;
  logger.log(`Expected result: `);
  if (expected.step_1_lp_reward.isZero()) {
    logger.log(`    Step 1: skipped`);
  } else {
    logger.log(`    Step 1: `);
    logger.log(`        Left deposit = ${expected.step_1_left_deposit.shiftedBy(-left_decimals).toFixed(left_decimals)}`);
    logger.log(`        Right deposit = ${expected.step_1_right_deposit.shiftedBy(-right_decimals).toFixed(right_decimals)}`);
    logger.log(`        LP reward = ${expected.step_1_lp_reward.shiftedBy(-Constants.LP_DECIMALS).toFixed(Constants.LP_DECIMALS)}`);
  }
  if (expected.step_2_left_to_right) {
    logger.log(`    Step 2: `);
    logger.log(`        Left amount for change = ${expected.step_2_spent.shiftedBy(-left_decimals).toFixed(left_decimals)}`);
    logger.log(`        Left fee = ${expected.step_2_fee.shiftedBy(-left_decimals).toFixed(left_decimals)}`);
    logger.log(`        Right received amount = ${expected.step_2_received.shiftedBy(-right_decimals).toFixed(right_decimals)}`);
  } else if (expected.step_2_right_to_left) {
    logger.log(`    Step 2: `);
    logger.log(`        Right amount for change = ${expected.step_2_spent.shiftedBy(-right_decimals).toFixed(right_decimals)}`);
    logger.log(`        Right fee = ${expected.step_2_fee.shiftedBy(-right_decimals).toFixed(right_decimals)}`);
    logger.log(`        Left received amount = ${expected.step_2_received.shiftedBy(-left_decimals).toFixed(left_decimals)}`);
  } else {
    logger.log(`    Step 2: skipped`);
  }
  if (expected.step_3_lp_reward.isZero()) {
    logger.log(`    Step 3: skipped`);
  } else {
    logger.log(`    Step 3: `);
    logger.log(`        Left deposit = ${expected.step_3_left_deposit.shiftedBy(-left_decimals).toFixed(left_decimals)}`);
    logger.log(`        Right deposit = ${expected.step_3_right_deposit.shiftedBy(-right_decimals).toFixed(right_decimals)}`);
    logger.log(`        LP reward = ${expected.step_3_lp_reward.shiftedBy(-Constants.LP_DECIMALS).toFixed(Constants.LP_DECIMALS)}`);
  }
  logger.log(`    TOTAL: `);
  logger.log(`        LP reward = ${expected.step_1_lp_reward.plus(expected.step_3_lp_reward).shiftedBy(-Constants.LP_DECIMALS).toFixed(Constants.LP_DECIMALS)}`);
}

async function expectedDepositLiquidity(pairAddress, contractName, tokens, amounts, autoChange) {

  const pair = await locklift.factory.getContract(contractName);
  pair.setAddress(pairAddress)

  let LP_REWARD = "0";

  if (contractName === "DexStablePair" || contractName === "DexStablePool" || contractName === "DexStablePoolPrev") {
    const expected = await pair.call({
      method: 'expectedDepositLiquidityV2',
      params: {
        amounts
      }
    });

    LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

    logExpectedDepositV2(expected, tokens);
  } else {

    const expected = await pair.call({
      method: 'expectedDepositLiquidity',
      params: {
        left_amount: amounts[0],
        right_amount: amounts[1],
        auto_change: autoChange
      }
    });

    LP_REWARD = new BigNumber(expected.step_1_lp_reward)
        .plus(expected.step_3_lp_reward).shiftedBy(-9).toString();

    logExpectedDeposit(expected, tokens);
  }

  return LP_REWARD;
}

async function expectedDepositLiquidityOneCoin(poolAddress, tokens, amount, spent_token_root) {

  const pool = await locklift.factory.getContract("DexStablePool");
  pool.setAddress(poolAddress)

  let LP_REWARD = "0";

  const expected = await pool.call({
    method: 'expectedDepositLiquidityOneCoin',
    params: {
      spent_token_root,
      amount
    }
  });

  LP_REWARD = new BigNumber(expected.lp_reward).shiftedBy(-9).toString();

  logExpectedDepositV2(expected, tokens);

  return LP_REWARD;
}

module.exports = {
  Migration,
  Constants,
  calcValue,
  getRandomNonce,
  stringToBytesArray,
  sleep,
  getBalance,
  displayAccount,
  displayTx,
  afterRun,
  TOKEN_CONTRACTS_PATH,
  EMPTY_TVM_CELL,
  expectedDepositLiquidity,
  expectedDepositLiquidityOneCoin,
  logExpectedDeposit,
  logExpectedDepositV2
}
