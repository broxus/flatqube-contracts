import { expect } from "chai";
import { Contract, toNano, zeroAddress } from "locklift";
import { Account } from "everscale-standalone-client/nodejs";

import {
  DexAccountAbi,
  DexGasValuesAbi,
  DexPairAbi,
  DexRootAbi,
  DexTokenVaultAbi,
  TokenRootUpgradeableAbi,
  TokenWalletUpgradeableAbi,
} from "../../build/factorySource";
import { calcValue } from "../utils/gas.utils";
import { BigNumber } from "bignumber.js";

describe("Check DexAccounts interaction", () => {
  let pair: Contract<DexPairAbi>;
  let dexAccount: Contract<DexAccountAbi>;
  let owner: Account;
  let dexAccount1: Contract<DexAccountAbi>;
  let account1: Account;
  let dexRoot: Contract<DexRootAbi>;
  let gasValues: Contract<DexGasValuesAbi>;

  let tokenRoot: Contract<TokenRootUpgradeableAbi>;
  let tokenWallet: Contract<TokenWalletUpgradeableAbi>;
  let dexTokenVault: Contract<DexTokenVaultAbi>;
  let dexTokenVaultWallet: Contract<TokenWalletUpgradeableAbi>;

  const pairRoots = ["token-9-0", "token-9-1"];

  before("Load contracts", async () => {
    await locklift.deployments.fixture({
      include: ["dex-gas-values", "dex-accounts", "dex-pairs"],
    });
    owner = locklift.deployments.getAccount("DexOwner").account;

    gasValues =
      locklift.deployments.getContract<DexGasValuesAbi>("DexGasValues");
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

    dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");
    pair = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_" + pairRoots.join("_"),
    );

    tokenRoot = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      pairRoots[0],
    );
    tokenWallet = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      await tokenRoot.methods
        .walletOf({
          answerId: 0,
          walletOwner: owner.address,
        })
        .call()
        .then(a => a.value0),
    );

    account1 = locklift.deployments.getAccount("commonAccount-1").account;
    dexAccount1 =
      locklift.deployments.getContract<DexAccountAbi>("commonDexAccount-1");

    dexTokenVault = locklift.factory.getDeployedContract(
      "DexTokenVault",
      await dexRoot.methods
        .getExpectedTokenVaultAddress({
          answerId: 0,
          _tokenRoot: tokenRoot.address,
        })
        .call()
        .then(a => a.value0),
    );

    dexTokenVaultWallet = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      await tokenRoot.methods
        .walletOf({
          answerId: 0,
          walletOwner: dexTokenVault.address,
        })
        .call()
        .then(a => a.value0),
    );
  });

  describe("Check transfer from account to dexAccount", () => {
    it("Check transfer from account to dexAccount before adding any pool (revert)", async () => {
      const gas = await gasValues.methods
        .getDepositToAccountGas()
        .call()
        .then(a => a.value0);

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: 10 ** 9,
            recipient: dexAccount.address,
            deployWalletValue: toNano(0.1),
            remainingGasTo: owner.address,
            notify: true,
            payload: null,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas, true) + toNano(0.1),
          }),
      );

      const ownerBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        tokenWallet.address,
      );
      expect(ownerBalanceChange).to.equal(
        "0",
        "Tokens didn't come back to owner wallet",
      );

      const dexAccountBalance = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      expect(dexAccountBalance).to.equal("0", "DexAccount balance is non zero");

      const dexBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        dexTokenVaultWallet.address,
      );
      expect(dexBalanceChange).to.equal("0", "Dex wallet balance changed");
    });

    it("Check transfer from account to dexAccount", async () => {
      const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();

      dexAccount.methods
        .addPool({
          _roots: [roots.left, roots.right],
        })
        .send({
          from: owner.address,
          amount: toNano(5),
        });

      const gas = await gasValues.methods
        .getDepositToAccountGas()
        .call()
        .then(a => a.value0);

      const deposit = new BigNumber(1).shiftedBy(9).toString();

      const { traceTree } = await locklift.tracing.trace(
        tokenWallet.methods
          .transfer({
            amount: deposit,
            recipient: dexAccount.address,
            deployWalletValue: 0,
            remainingGasTo: owner.address,
            notify: true,
            payload: null,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas, true),
          }),
      );

      const ownerBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        tokenWallet.address,
      );
      expect(ownerBalanceChange).to.equal(
        (-deposit).toString(),
        "Account has wrong balance",
      );

      const dexAccountBalance = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      expect(dexAccountBalance).to.equal(
        deposit,
        "DexAccount has wrong balance",
      );

      const dexBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        dexTokenVaultWallet.address,
      );
      expect(dexBalanceChange).to.equal(
        deposit,
        "Dex wallet has wrong balance",
      );
    });
  });

  describe("Check internal transfer", () => {
    it("Check transfer to another DexAccount, willing_to_deploy = false (revert)", async () => {
      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceStart = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountTransferGas({ willing_to_deploy: false })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      dexAccount.methods
        .transfer({
          call_id: 2,
          amount: amount,
          token_root: tokenRoot.address,
          recipient: account1.address,
          willing_to_deploy: false,
          send_gas_to: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceEnd = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      expect(dexAccountBalanceStart).to.equal(
        dexAccountBalanceEnd,
        "Sender's DexAccount has wrong balance",
      );
      expect(dexAccount1BalanceStart).to.equal(
        dexAccount1BalanceEnd,
        "Recipient's DexAccount has wrong balance",
      );
    });

    it("Check transfer to another DexAccount, willing_to_deploy = true", async () => {
      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceStart = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountTransferGas({ willing_to_deploy: true })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .transfer({
            call_id: 1,
            amount: amount,
            token_root: tokenRoot.address,
            recipient: account1.address,
            willing_to_deploy: true,
            send_gas_to: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
        {
          allowedCodes: {
            compute: [100],
          },
        },
      );

      expect(traceTree)
        .to.emit("TransferTokens", dexAccount)
        .withNamedArgs({
          amount: amount,
          root: tokenRoot.address,
        })
        .and.emit("TokensReceivedFromAccount", dexAccount1)
        .withNamedArgs({
          tokens_amount: amount,
          token_root: tokenRoot.address,
        });

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceEnd = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      expect(
        new BigNumber(dexAccountBalanceStart).minus(amount).toString(),
      ).to.equal(dexAccountBalanceEnd, "Sender's DexAccount has wrong balance");
      expect(
        new BigNumber(dexAccount1BalanceStart).plus(amount).toString(),
      ).to.equal(
        dexAccount1BalanceEnd,
        "Recipient's DexAccount has wrong balance",
      );
    });

    it("Check transfer to non exists account (revert)", async () => {
      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountTransferGas({ willing_to_deploy: true })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      dexAccount.methods
        .transfer({
          call_id: 3,
          amount: amount,
          token_root: tokenRoot.address,
          recipient: pair.address,
          willing_to_deploy: true,
          send_gas_to: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      expect(dexAccountBalanceStart).to.equal(
        dexAccountBalanceEnd,
        "DexAccount has wrong balance",
      );
    });

    it("Check transfer in case of zero account balance (revert)", async () => {
      const zeroTokenRoot =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pairRoots[1]);

      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceStart = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountTransferGas({ willing_to_deploy: true })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      dexAccount.methods
        .transfer({
          call_id: 3,
          amount: amount,
          token_root: zeroTokenRoot.address,
          recipient: dexAccount1.address,
          willing_to_deploy: true,
          send_gas_to: owner.address,
        })
        .send({
          from: owner.address,
          amount: calcValue(gas),
        });

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);
      const dexAccount1BalanceEnd = await dexAccount1.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);

      expect(dexAccountBalanceStart).to.equal(
        dexAccountBalanceEnd,
        "Sender's DexAccount has wrong balance",
      );
      expect(dexAccount1BalanceStart).to.equal(
        dexAccount1BalanceEnd,
        "Recipient's DexAccount has wrong balance",
      );
    });
  });

  describe("Check withdrawal from dexAccount", () => {
    it("Check withdrawal from dexAccount", async () => {
      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountWithdrawGas({ deployWalletValue: 0 })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdraw({
            call_id: 4,
            amount: amount,
            token_root: tokenRoot.address,
            recipient_address: owner.address,
            deploy_wallet_grams: 0,
            send_gas_to: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
      );

      expect(traceTree)
        .to.emit("WithdrawTokens", dexAccount)
        .withNamedArgs({
          amount: amount,
          root: tokenRoot.address,
        })
        .and.emit("WithdrawTokens", dexTokenVault)
        .withNamedArgs({
          amount: amount,
        });

      const ownerBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        tokenWallet.address,
      );
      expect(ownerBalanceChange).to.equal(amount, "Account has wrong balance");

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: tokenRoot.address })
        .call()
        .then(a => a.balance);
      expect(
        new BigNumber(dexAccountBalanceStart).minus(amount).toString(),
      ).to.equal(dexAccountBalanceEnd, "DexAccount has wrong balance");

      const dexBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        dexTokenVaultWallet.address,
      );
      expect(dexBalanceChange).to.equal(
        (-amount).toString(),
        "Dex wallet has wrong balance",
      );
    });

    it("Check withdrawal in case of zero account balance (revert)", async () => {
      const zeroTokenRoot =
        locklift.deployments.getContract<TokenRootUpgradeableAbi>(pairRoots[1]);

      const dexAccountBalanceStart = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);

      const gas = await gasValues.methods
        .getAccountWithdrawGas({ deployWalletValue: 0 })
        .call()
        .then(a => a.value0);

      const amount = new BigNumber(1).shiftedBy(8).toString();

      const { traceTree } = await locklift.tracing.trace(
        dexAccount.methods
          .withdraw({
            call_id: 4,
            amount: amount,
            token_root: zeroTokenRoot.address,
            recipient_address: owner.address,
            deploy_wallet_grams: 0,
            send_gas_to: owner.address,
          })
          .send({
            from: owner.address,
            amount: calcValue(gas),
          }),
        {
          allowedCodes: {
            compute: [118],
          },
        },
      );

      const dexAccountBalanceEnd = await dexAccount.methods
        .getWalletData({ answerId: 0, token_root: zeroTokenRoot.address })
        .call()
        .then(a => a.balance);
      expect(dexAccountBalanceStart).to.equal(
        dexAccountBalanceEnd,
        "DexAccount has wrong balance",
      );

      const dexBalanceChange = traceTree?.tokens.getTokenBalanceChange(
        dexTokenVaultWallet.address,
      );
      expect(dexBalanceChange).to.equal("0", "Dex wallet has wrong balance");
    });
  });
});
