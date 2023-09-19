import { BigNumber } from 'bignumber.js';
import { expect } from 'chai';
import logger from 'mocha-logger-ts';
import { Account } from 'everscale-standalone-client/nodejs';
import { Contract, fromNano, toNano, zeroAddress } from 'locklift';

import { Migration, Constants, displayTx } from '../utils/migration';
import {
  DexPairAbi,
  EverToTip3Abi,
  EverWeverToTip3Abi,
  TestWeverVaultAbi,
  Tip3ToEverAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from '../../build/factorySource';

BigNumber.config({ EXPONENTIAL_AT: 257 });

const migration = new Migration();

const logBalances = (
  header: string,
  dex: Record<string, string>,
  account: Record<string, string>,
  pair: Record<string, string>,
) => {
  logger.log(`DEX balance ${header}: ${dex.tst} TST, ${dex.wever} WEVER`);
  logger.log(
    `Account#3 balance ${header}: ` +
      `${account.tst !== undefined ? account.tst + ' TST' : 'TST'}, ` +
      `${account.ever !== undefined ? account.ever + ' EVER' : 'Ever'}, ` +
      `${account.wever !== undefined ? account.wever + ' WEVER' : 'Wever'}`,
  );
  logger.log(
    `Pair balance ${header}: ` +
      `${pair.tst !== undefined ? pair.tst + ' TST' : 'TST'}, ` +
      `${pair.wever !== undefined ? pair.wever + ' WEVER' : 'WEVER'}`,
  );
};

describe('Tests Swap Evers', () => {
  let account2: Account;
  let account3: Account;

  let everToTip3: Contract<EverToTip3Abi>;
  let tip3ToEver: Contract<Tip3ToEverAbi>;
  let everWeverToTip3: Contract<EverWeverToTip3Abi>;
  let dexPair: Contract<DexPairAbi>;
  let wEverRoot: Contract<TokenRootUpgradeableAbi>;
  let tstRoot: Contract<TokenRootUpgradeableAbi>;
  let wEverVault: Contract<TestWeverVaultAbi>;
  let tstWallet3: Contract<TokenWalletUpgradeableAbi>;
  let tstVaultWallet: Contract<TokenWalletUpgradeableAbi>;
  let wEverVaultWallet: Contract<TokenWalletUpgradeableAbi>;
  let IS_WEVER_LEFT: boolean;
  // let wEverWallet2: Contract<TokenWalletUpgradeableAbi>;
  let wEverWallet3: Contract<TokenWalletUpgradeableAbi>;

  const dexPairInfo = async () => {
    const balances = await dexPair.methods
      .getBalances({ answerId: 0 })
      .call()
      .then((r) => r.value0);

    let wever, tst;

    if (IS_WEVER_LEFT) {
      wever = new BigNumber(balances.left_balance).shiftedBy(-9).toString();
      tst = new BigNumber(balances.right_balance)
        .shiftedBy(-Constants.tokens.tst.decimals)
        .toString();
    } else {
      wever = new BigNumber(balances.right_balance).shiftedBy(-9).toString();
      tst = new BigNumber(balances.left_balance)
        .shiftedBy(-Constants.tokens.tst.decimals)
        .toString();
    }

    return {
      wever: wever,
      tst: tst,
    };
  };

  const dexBalances = async (): Promise<Record<string, string>> => {
    const tst = await tstVaultWallet.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        return new BigNumber(n.value0)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString();
      });

    const wever = await wEverVaultWallet.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        return new BigNumber(n.value0)
          .shiftedBy(-Constants.tokens.wever.decimals)
          .toString();
      });

    return { tst, wever };
  };

  const account3balances = async (): Promise<Record<string, string>> => {
    let tst: string;

    await tstWallet3.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        tst = new BigNumber(n.value0)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    let wever: string;

    await wEverWallet3.methods
      .balance({ answerId: 0 })
      .call()
      .then((n) => {
        wever = new BigNumber(n.value0)
          .shiftedBy(-Constants.tokens.wever.decimals)
          .toString();
      })
      .catch(() => {
        /*ignored*/
      });

    const ever = fromNano(await locklift.provider.getBalance(account3.address));

    return { tst, ever, wever };
  };

  before('Load contracts', async () => {
    everToTip3 = migration.loadContract('EverToTip3', 'EverToTip3');
    tip3ToEver = migration.loadContract('Tip3ToEver', 'Tip3ToEver');
    everWeverToTip3 = migration.loadContract(
      'EverWeverToTip3',
      'EverWeverToTip3',
    );

    dexPair = migration.loadContract('DexPair', 'DexPoolTstWEVER');
    wEverRoot = migration.loadContract('TokenRootUpgradeable', 'WEVERRoot');
    tstRoot = migration.loadContract('TokenRootUpgradeable', 'TstRoot');
    wEverVault = migration.loadContract('TestWeverVault', 'WEVERVault');
    // wEverWallet2 = migration.loadContract(
    //   'TokenWalletUpgradeable',
    //   'WEVERWallet2',
    // );
    tstVaultWallet = migration.loadContract(
      'TokenWalletUpgradeable',
      'TstVaultWallet',
    );
    wEverVaultWallet = migration.loadContract(
      'TokenWalletUpgradeable',
      'WEVERVaultWallet',
    );

    const pairRoots = await dexPair.methods
      .getTokenRoots({ answerId: 0 })
      .call();

    IS_WEVER_LEFT = pairRoots.left === wEverRoot.address;

    account2 = await migration.loadAccount('Account2', '2');
    account3 = await migration.loadAccount('Account3', '3');

    const tokenWalletAddress = await tstRoot.methods
      .walletOf({ answerId: 0, walletOwner: account3.address })
      .call()
      .then((r) => r.value0);

    tstWallet3 = locklift.factory.getDeployedContract(
      'TokenWalletUpgradeable',
      tokenWalletAddress,
    );
    migration.store(tstWallet3, 'TstWallet3');

    const tokenWalletAddressWever = await wEverRoot.methods
      .walletOf({ answerId: 0, walletOwner: account3.address })
      .call()
      .then((r) => r.value0);

    wEverWallet3 = locklift.factory.getDeployedContract(
      'TokenWalletUpgradeable',
      tokenWalletAddressWever,
    );
    migration.store(wEverWallet3, 'WEVERWallet3');

    logger.log(`account3(wEverVault.address).wrap(
            tokens = ${new BigNumber(20).shiftedBy(9).toString()},
            owner_address: ${everToTip3.address},
            gas_back_address: ${account3.address},
            payload: EMPTY_TVM_CELL}
        )`);

    const txWrap = await wEverVault.methods
      .wrap({
        tokens: new BigNumber(20).shiftedBy(9).toString(),
        owner_address: account3.address,
        gas_back_address: account3.address,
        payload: '',
      })
      .send({ from: account3.address, amount: toNano(20 + 2) });

    displayTx(txWrap);
    logger.log(``);

    logger.log(`EverToTip3: ${everToTip3.address}`);
    logger.log(`Tip3ToEver: ${tip3ToEver.address}`);
    logger.log(`EverWEverToTip3: ${everWeverToTip3.address}`);
    logger.log(`DexPair: ${dexPair.address}`);
    logger.log(`WeverRoot: ${wEverRoot.address}`);
    logger.log(`TstRoot: ${tstRoot.address}`);
    logger.log(`WEverVault: ${wEverVault.address}`);
    logger.log(`TstVaultWallet: ${tstVaultWallet.address}`);
    logger.log(`WeverVaultWallet: ${wEverVaultWallet.address}`);
    logger.log(`Account2: ${account2.address}`);
    logger.log(`Account3: ${account3.address}`);
    logger.log(`TstWallet3: ${tstWallet3.address}`);
    logger.log(`wEverWallet3: ${wEverWallet3.address}`);
  });

  describe('Swap Ever to Tip3', () => {
    it(`Swap Ever to Tip3 via  () - Success`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const EVERS_TO_EXCHANGE = 20;
      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          spent_token_root: wEverRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${EVERS_TO_EXCHANGE} WEVER`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-9)
          .toString()} WEVER`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );

      const params = {
        id: 66,
        pair: dexPair.address,
        expectedAmount: expected.expected_amount,
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(`EverToTip3.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await everToTip3.methods
        .buildExchangePayload(params)
        .call()
        .then((r) => r.value0);

      logger.log(`Result payload = ${payload}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);

      logger.log(`wEverVault(wEverVault.address).wrap(
                tokens = ${new BigNumber(EVERS_TO_EXCHANGE)
                  .shiftedBy(9)
                  .toString()},
                owner_address: ${everToTip3.address},
                gas_back_address: ${account3.address},
                payload: {${JSON.stringify(params)}}
            )`);
      const tx = await wEverVault.methods
        .wrap({
          tokens: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          owner_address: everToTip3.address,
          gas_back_address: account3.address,
          payload: payload,
        })
        .send({
          from: account3.address,
          amount: toNano(EVERS_TO_EXCHANGE + 5),
        });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances('end', dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst || 0)
        .plus(
          new BigNumber(expected.expected_amount).shiftedBy(
            -Constants.tokens.tst.decimals,
          ),
        )
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
    });

    it(`Swap Ever to Tip3 via wrap() - Cancel`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const EVERS_TO_EXCHANGE = 20;
      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          spent_token_root: wEverRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${EVERS_TO_EXCHANGE} WEVER`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-9)
          .toString()} WEVER`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );

      const params = {
        id: 66,
        pair: dexPair.address,
        expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(`EverToTip3.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await everToTip3.methods
        .buildExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);

      logger.log(`wEverVault(${wEverVault.address}).wrap(
                    tokens = ${new BigNumber(EVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    owner_address: ${everToTip3.address},
                    gas_back_address: ${account3.address},
                    payload: {${JSON.stringify(params)}}
                )`);
      const tx = await wEverVault.methods
        .wrap({
          tokens: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          owner_address: everToTip3.address,
          gas_back_address: account3.address,
          payload: payload.value0,
        })
        .send({
          from: account3.address,
          amount: toNano(EVERS_TO_EXCHANGE + 5),
        });
      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances('end', dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
      expect(new BigNumber(accountStart.ever).minus(5).toNumber()).lt(
        new BigNumber(accountEnd.ever).toNumber(),
        'Wrong Account#3 TST balance',
      );
    });
  });

  describe('Swap Tip3 to Ever', () => {
    it(`Swap Tip3 to Ever - Cancel`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);
      const TOKENS_TO_EXCHANGE = accountStart.tst;
      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(TOKENS_TO_EXCHANGE)
            .shiftedBy(Constants.tokens.tst.decimals)
            .toString(),
          spent_token_root: tstRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} TST`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-9)
          .toString()} EVER`,
      );

      const params = {
        id: 66,
        pair: dexPair.address,
        expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(`Tip3ToEver.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await tip3ToEver.methods
        .buildExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload}`);

      logger.log(`tstWallet3(${tstWallet3.address}).transfer(
                amount: ${new BigNumber(TOKENS_TO_EXCHANGE)
                  .shiftedBy(Constants.tokens.tst.decimals)
                  .toString()},
                recipient: ${tip3ToEver.address},
                deployWalletValue: ${toNano(0.1)},
                remainingGasTo: ${account3.address},
                notify: ${true},
                payload: {${JSON.stringify(params)}}
            )`);
      const tx = await tstWallet3.methods
        .transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE)
            .shiftedBy(Constants.tokens.tst.decimals)
            .toString(),
          recipient: tip3ToEver.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0,
        })
        .send({ from: account3.address, amount: toNano(3.6) });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();

      logBalances('end', dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
    });

    it(`Swap Tip3 to Ever - Success`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);
      const TOKENS_TO_EXCHANGE = accountStart.tst;
      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(TOKENS_TO_EXCHANGE)
            .shiftedBy(Constants.tokens.tst.decimals)
            .toString(),
          spent_token_root: tstRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${TOKENS_TO_EXCHANGE} TST`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-9)
          .toString()} EVER`,
      );

      const params = {
        id: 66,
        pair: dexPair.address,
        expectedAmount: expected.expected_amount,
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(`Tip3ToEver.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await tip3ToEver.methods
        .buildExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload}`);

      logger.log(`tstWallet3(${tstWallet3.address}).transfer(
                amount: ${new BigNumber(TOKENS_TO_EXCHANGE)
                  .shiftedBy(Constants.tokens.tst.decimals)
                  .toString()},
                recipient: ${tip3ToEver.address},
                deployWalletValue: ${toNano(0.1)},
                remainingGasTo: ${account3.address},
                notify: ${true},
                payload: {${JSON.stringify(params)}}
            )`);
      const tx = await tstWallet3.methods
        .transfer({
          amount: new BigNumber(TOKENS_TO_EXCHANGE)
            .shiftedBy(Constants.tokens.tst.decimals)
            .toString(),
          recipient: tip3ToEver.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0,
        })
        .send({ from: account3.address, amount: toNano(3.6) });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances('end', dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst)
        .minus(TOKENS_TO_EXCHANGE)
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
      const expectedAccountEverMin = new BigNumber(accountStart.ever)
        .plus(new BigNumber(expected.expected_amount).shiftedBy(-9))
        .minus(3.6)
        .toNumber();
      expect(expectedAccountEverMin).to.lt(
        new BigNumber(accountEnd.ever).toNumber(),
        'Wrong Account#3 EVER balance',
      );
    });
  });

  describe('Swap Ever and Wever to Tip3', () => {
    it(`Swap Ever and Wever to Tip3 - Cancel`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const EVERS_TO_EXCHANGE = 5;
      const WEVERS_TO_EXCHANGE = 5;

      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE)
            .shiftedBy(9)
            .toString(),
          spent_token_root: wEverRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${EVERS_TO_EXCHANGE} EVER`);
      logger.log(`Spent amount: ${WEVERS_TO_EXCHANGE} WEVER`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-9)
          .toString()} WEVER`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );

      const params = {
        id: 11,
        amount: new BigNumber(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE)
          .shiftedBy(9)
          .toString(),
        pair: dexPair.address,
        expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(
        `everWeverToTip3.buildExchangePayload(${JSON.stringify(params)})`,
      );
      const payload = await everWeverToTip3.methods
        .buildExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);

      logger.log(`account3(${account3.address}).transfer(
                    amount: ${new BigNumber(WEVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    recipient: ${everWeverToTip3.address},
                    deployWalletValue: ${toNano(0.1)},
                    remainingGasTo: ${account3.address},
                    notify: ${true},
                    payload: {${JSON.stringify(params)}}
                )`);

      const tx = await wEverWallet3.methods
        .transfer({
          amount: BigNumber(WEVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          recipient: everWeverToTip3.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0,
        })
        .send({
          from: account3.address,
          amount: toNano(EVERS_TO_EXCHANGE + 5),
        });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances('end', dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
    });

    it(`Swap Ever and Wever to Tip3 - Success`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const EVERS_TO_EXCHANGE = 5;
      const WEVERS_TO_EXCHANGE = 5;

      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE)
            .shiftedBy(9)
            .toString(),
          spent_token_root: wEverRoot.address,
        })
        .call();

      logger.log(`Spent amount: ${EVERS_TO_EXCHANGE} EVER`);
      logger.log(`Spent amount: ${WEVERS_TO_EXCHANGE} WEVER`);
      logger.log(
        `Expected fee: ${new BigNumber(expected.expected_fee)
          .shiftedBy(-9)
          .toString()} WEVER`,
      );
      logger.log(
        `Expected receive amount: ${new BigNumber(expected.expected_amount)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString()} TST`,
      );

      const params = {
        id: 11,
        amount: new BigNumber(EVERS_TO_EXCHANGE + WEVERS_TO_EXCHANGE)
          .shiftedBy(9)
          .toString(),
        pair: dexPair.address,
        expectedAmount: expected.expected_amount,
        deployWalletValue: toNano(0.1),
        referrer: zeroAddress,
        outcoming: zeroAddress,
      };

      logger.log(
        `everWeverToTip3.buildExchangePayload(${JSON.stringify(params)})`,
      );
      const payload = await everWeverToTip3.methods
        .buildExchangePayload(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances('start', dexStart, accountStart, pairStart);

      logger.log(`account3(${account3.address}).transfer(
                    amount: ${new BigNumber(WEVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    recipient: ${everWeverToTip3.address},
                    deployWalletValue: ${toNano(0.1)},
                    remainingGasTo: ${account3.address},
                    notify: ${true},
                    payload: {${JSON.stringify(params)}}
                )`);

      const tx = await wEverWallet3.methods
        .transfer({
          amount: BigNumber(WEVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          recipient: everWeverToTip3.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0,
        })
        .send({
          from: account3.address,
          amount: toNano(EVERS_TO_EXCHANGE + 5),
        });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances('end', dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst || 0)
        .plus(
          new BigNumber(expected.expected_amount).shiftedBy(
            -Constants.tokens.tst.decimals,
          ),
        )
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        'Wrong Account#3 TST balance',
      );
    });
  });
});
