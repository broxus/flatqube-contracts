import { BigNumber } from "bignumber.js";
import { expect } from "chai";
import logger from "mocha-logger-ts";
import { Account } from "everscale-standalone-client/nodejs";
import { Contract, fromNano, toNano, zeroAddress } from "locklift";

import {
  Migration,
  Constants,
  displayTx,
} from "../../utils/oldUtils/migration";
import {
  DexPairAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
  VaultTokenRoot_V1Abi,
  VaultTokenWallet_V1Abi,
} from "../../build/factorySource";

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
      `${account.tst !== undefined ? account.tst + " TST" : "TST"}, ` +
      `${account.ever !== undefined ? account.ever + " EVER" : "Ever"}, ` +
      `${account.wever !== undefined ? account.wever + " WEVER" : "Wever"}`,
  );
  logger.log(
    `Pair balance ${header}: ` +
      `${pair.tst !== undefined ? pair.tst + " TST" : "TST"}, ` +
      `${pair.wever !== undefined ? pair.wever + " WEVER" : "WEVER"}`,
  );
};

describe("Tests Swap Evers", () => {
  let account2: Account;
  let account3: Account;

  let weverVaultTokenRoot: Contract<VaultTokenRoot_V1Abi>;
  let dexPair: Contract<DexPairAbi>;
  let tstRoot: Contract<TokenRootUpgradeableAbi>;
  let tstWallet3: Contract<TokenWalletUpgradeableAbi>;
  let tstVaultWallet: Contract<TokenWalletUpgradeableAbi>;
  let wEverVaultWallet: Contract<TokenWalletUpgradeableAbi>;
  let IS_WEVER_LEFT: boolean;
  // let wEverWallet2: Contract<TokenWalletUpgradeableAbi>;
  let wEverWallet3: Contract<VaultTokenWallet_V1Abi>;

  const dexPairInfo = async () => {
    const balances = await dexPair.methods
      .getBalances({ answerId: 0 })
      .call()
      .then(r => r.value0);

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
      .then(n => {
        return new BigNumber(n.value0)
          .shiftedBy(-Constants.tokens.tst.decimals)
          .toString();
      });

    const wever = await wEverVaultWallet.methods
      .balance({ answerId: 0 })
      .call()
      .then(n => {
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
      .then(n => {
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
      .then(n => {
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

  before("Load contracts", async () => {
    weverVaultTokenRoot = migration.loadContract(
      "VaultTokenRoot_V1",
      "WEVERRoot",
    );
    dexPair = migration.loadContract("DexPair", "DexPoolTstWEVER");
    tstRoot = migration.loadContract("TokenRootUpgradeable", "TstRoot");
    tstVaultWallet = migration.loadContract(
      "TokenWalletUpgradeable",
      "TstVaultWallet",
    );
    wEverVaultWallet = migration.loadContract(
      "TokenWalletUpgradeable",
      "WEVERVaultWallet",
    );

    const pairRoots = await dexPair.methods
      .getTokenRoots({ answerId: 0 })
      .call();

    IS_WEVER_LEFT = pairRoots.left === weverVaultTokenRoot.address;

    account2 = await migration.loadAccount("Account2", "2");
    account3 = await migration.loadAccount("Account3", "3");

    const tokenWalletAddress = await tstRoot.methods
      .walletOf({ answerId: 0, walletOwner: account3.address })
      .call()
      .then(r => r.value0);

    tstWallet3 = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      tokenWalletAddress,
    );
    migration.store(tstWallet3, "TstWallet3");

    wEverWallet3 = await weverVaultTokenRoot.methods
      .walletOf({ answerId: 0, walletOwner: account3.address })
      .call()
      .then(r =>
        locklift.factory.getDeployedContract("VaultTokenWallet_V1", r.value0),
      );

    logger.log(`account3(wEverVault.address).wrap({
            tokens: ${new BigNumber(20).shiftedBy(9).toString()},
            recipient: ${account3.address},
            deployWalletValue: 0,
            remainingGasTo: ${account3.address},
            notify: false,
            payload: EMPTY_TVM_CELL
        })`);

    const txWrap = await weverVaultTokenRoot.methods
      .wrap({
        tokens: new BigNumber(20).shiftedBy(9).toString(),
        recipient: account3.address,
        deployWalletValue: 0,
        remainingGasTo: account3.address,
        notify: false,
        payload: "",
      })
      .send({ from: account3.address, amount: toNano(20 + 2) });

    displayTx(txWrap);
    logger.log(``);

    logger.log(`DexPair: ${dexPair.address}`);
    logger.log(`WeverRoot: ${weverVaultTokenRoot.address}`);
    logger.log(`TstRoot: ${tstRoot.address}`);
    logger.log(`TstVaultWallet: ${tstVaultWallet.address}`);
    logger.log(`WeverVaultWallet: ${wEverVaultWallet.address}`);
    logger.log(`Account2: ${account2.address}`);
    logger.log(`Account3: ${account3.address}`);
    logger.log(`TstWallet3: ${tstWallet3.address}`);
    logger.log(`wEverWallet3: ${wEverWallet3.address}`);
  });

  describe("Swap Ever to Tip3", () => {
    it(`Swap Ever to Tip3 via  () - Success`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const EVERS_TO_EXCHANGE = 20;
      const expected = await dexPair.methods
        .expectedExchange({
          answerId: 0,
          amount: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          spent_token_root: weverVaultTokenRoot.address,
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
        _id: 66,
        _expectedAmount: expected.expected_amount,
        _deployWalletGrams: toNano(0.1),
        _recipient: account3.address,
        _referrer: zeroAddress,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: false,
      };

      logger.log(`EverToTip3.buildExchangePayload(${JSON.stringify(params)})`);

      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call()
        .then(r => r.value0);

      logger.log(`Result payload = ${payload}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances("start", dexStart, accountStart, pairStart);

      logger.log(`wEverVault(wEverVault.address).wrap(
                tokens = ${new BigNumber(EVERS_TO_EXCHANGE)
                  .shiftedBy(9)
                  .toString()},
                recipient: ${dexPair.address},
                remainingGasTo: ${account3.address},
                payload: {${JSON.stringify(params)}}
            )`);
      const tx = await weverVaultTokenRoot.methods
        .wrap({
          tokens: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          recipient: dexPair.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
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
      logBalances("end", dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst || 0)
        .plus(
          new BigNumber(expected.expected_amount).shiftedBy(
            -Constants.tokens.tst.decimals,
          ),
        )
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
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
          spent_token_root: weverVaultTokenRoot.address,
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
        _id: 66,
        _expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        _deployWalletGrams: toNano(0.1),
        _recipient: account3.address,
        _referrer: zeroAddress,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: false,
      };

      logger.log(`EverToTip3.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances("start", dexStart, accountStart, pairStart);

      logger.log(`wEverVault(${weverVaultTokenRoot.address}).wrap(
                    tokens = ${new BigNumber(EVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    owner_address: ${dexPair.address},
                    gas_back_address: ${account3.address},
                    payload: {${JSON.stringify(params)}}
                )`);
      const tx = await wEverWallet3.methods
        .transfer({
          amount: new BigNumber(EVERS_TO_EXCHANGE).shiftedBy(9).toString(),
          recipient: dexPair.address,
          deployWalletValue: 0,
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
      logBalances("end", dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
      );
      expect(new BigNumber(accountStart.ever).minus(5).toNumber()).lt(
        new BigNumber(accountEnd.ever).toNumber(),
        "Wrong Account#3 EVER balance",
      );
    });
  });

  describe("Swap Tip3 to Ever", () => {
    it(`Swap Tip3 to Ever - Cancel`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances("start", dexStart, accountStart, pairStart);
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
        _id: 66,
        _deployWalletGrams: 0,
        _expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        _recipient: account3.address,
        _referrer: zeroAddress,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: true,
      };

      logger.log(`Tip3ToEver.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      logger.log(`tstWallet3(${tstWallet3.address}).transfer(
                amount: ${new BigNumber(TOKENS_TO_EXCHANGE)
                  .shiftedBy(Constants.tokens.tst.decimals)
                  .toString()},
                recipient: ${dexPair.address},
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
          recipient: dexPair.address,
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

      logBalances("end", dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
      );
    });

    it(`Swap Tip3 to Ever - Success`, async () => {
      logger.log(`#############################`);
      logger.log(``);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances("start", dexStart, accountStart, pairStart);
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
        _id: 66,
        _deployWalletGrams: 0,
        _expectedAmount: expected.expected_amount,
        _recipient: account3.address,
        _referrer: zeroAddress,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: true,
      };

      logger.log(`Tip3ToEver.buildExchangePayload(${JSON.stringify(params)})`);
      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      logger.log(`tstWallet3(${tstWallet3.address}).transfer(
                amount: ${new BigNumber(TOKENS_TO_EXCHANGE)
                  .shiftedBy(Constants.tokens.tst.decimals)
                  .toString()},
                recipient: ${dexPair.address},
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
          recipient: dexPair.address,
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
      logBalances("end", dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst)
        .minus(TOKENS_TO_EXCHANGE)
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
      );
      const expectedAccountEverMin = new BigNumber(accountStart.ever)
        .plus(new BigNumber(expected.expected_amount).shiftedBy(-9))
        .minus(3.6)
        .toNumber();
      expect(expectedAccountEverMin).to.lt(
        new BigNumber(accountEnd.ever).toNumber(),
        "Wrong Account#3 EVER balance",
      );
    });
  });

  describe("Swap Ever and Wever to Tip3", () => {
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
          spent_token_root: weverVaultTokenRoot.address,
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
        _id: 11,
        _expectedAmount: new BigNumber(expected.expected_amount)
          .times(2)
          .toString(),
        _deployWalletGrams: toNano(0.1),
        _referrer: zeroAddress,
        _recipient: account3.address,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: false,
      };

      logger.log(
        `everWeverToTip3.buildExchangePayload(${JSON.stringify(params)})`,
      );
      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();
      logBalances("start", dexStart, accountStart, pairStart);

      logger.log(`account3(${account3.address}).transfer(
                    amount: ${new BigNumber(WEVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    recipient: ${dexPair.address},
                    deployWalletValue: ${toNano(0.1)},
                    remainingGasTo: ${account3.address},
                    notify: ${true},
                    payload: {${JSON.stringify(params)}}
                )`);

      const tx = await wEverWallet3.methods
        .transfer({
          amount: BigNumber(WEVERS_TO_EXCHANGE + EVERS_TO_EXCHANGE)
            .shiftedBy(9)
            .toString(),
          recipient: dexPair.address,
          deployWalletValue: toNano(0.1),
          remainingGasTo: account3.address,
          notify: true,
          payload: payload.value0,
        })
        .send({
          from: account3.address,
          amount: toNano(5),
        });

      displayTx(tx);

      const dexEnd = await dexBalances();
      const accountEnd = await account3balances();
      const pairEnd = await dexPairInfo();
      logBalances("end", dexEnd, accountEnd, pairEnd);

      expect(accountStart.tst.toString()).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
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
          spent_token_root: weverVaultTokenRoot.address,
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
        _id: 11,
        _recipient: account3.address,
        _expectedAmount: expected.expected_amount,
        _deployWalletGrams: toNano(0.1),
        _referrer: zeroAddress,
        _successPayload: "",
        _cancelPayload: "",
        _toNative: false,
      };

      logger.log(
        `everWeverToTip3.buildExchangePayload(${JSON.stringify(params)})`,
      );
      const payload = await dexPair.methods
        .buildExchangePayloadV2(params)
        .call();

      logger.log(`Result payload = ${payload.value0}`);

      const dexStart = await dexBalances();
      const accountStart = await account3balances();
      const pairStart = await dexPairInfo();

      logBalances("start", dexStart, accountStart, pairStart);

      logger.log(`account3(${account3.address}).transfer(
                    amount: ${new BigNumber(WEVERS_TO_EXCHANGE)
                      .shiftedBy(9)
                      .toString()},
                    recipient: ${dexPair.address},
                    deployWalletValue: ${toNano(0.1)},
                    remainingGasTo: ${account3.address},
                    notify: ${true},
                    payload: {${JSON.stringify(params)}}
                )`);

      await locklift.transactions.waitFinalized(
        weverVaultTokenRoot.methods
          .wrap({
            tokens: toNano(WEVERS_TO_EXCHANGE),
            recipient: account3.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: account3.address,
            notify: false,
            payload: "",
          })
          .send({
            from: account3.address,
            amount: toNano(WEVERS_TO_EXCHANGE + 2),
          }),
      );

      const tx = await wEverWallet3.methods
        .transfer({
          amount: BigNumber(WEVERS_TO_EXCHANGE + EVERS_TO_EXCHANGE)
            .shiftedBy(9)
            .toString(),
          recipient: dexPair.address,
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
      logBalances("end", dexEnd, accountEnd, pairEnd);

      const expectedAccountTst = new BigNumber(accountStart.tst || 0)
        .plus(
          new BigNumber(expected.expected_amount).shiftedBy(
            -Constants.tokens.tst.decimals,
          ),
        )
        .toString();
      expect(expectedAccountTst).to.equal(
        accountEnd.tst.toString(),
        "Wrong Account#3 TST balance",
      );
    });
  });
});
