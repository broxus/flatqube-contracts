import {
  Address,
  Contract,
  getRandomNonce,
  toNano,
  zeroAddress,
} from "locklift";
import {
  DexRootAbi,
  DexVaultAbi,
  DexAccountAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenRootUpgradeableAbi,
} from "../build/factorySource";
import { BigNumber } from "bignumber.js";
import { TOKENS_DECIMALS, TOKENS_N, Constants } from "./consts";

export interface IFee {
  denominator: number | string;
  pool_numerator: number | string;
  beneficiary_numerator: number | string;
  referrer_numerator: number | string;
  beneficiary: Address;
  threshold: [Address, string | number][];
  referrer_threshold: [Address, string | number][];
}

export interface ITokens {
  root: Address;
  amount: string | number;
}

export interface IBalPool {
  balances: string[];
  lp_supply: string;
}

export interface IBalPair {
  left_balance: string;
  right_balance: string;
  lp_supply: string;
}

export const setPairFeeParams = async (roots: Address[], fees: IFee) => {
  const owner = locklift.deployments.getAccount("DexOwner").account;
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  return await dexRoot.methods
    .setPairFeeParams({
      _roots: roots,
      _params: fees,
      _remainingGasTo: owner.address,
    })
    .send({
      from: owner.address,
      amount: toNano(1.5),
    });
};

export const getThresholdForAllTokens = () => {
  const threshold: [Address, string | number][] = [];

  Array.from({ length: TOKENS_N }).map((_, i) => {
    TOKENS_DECIMALS.forEach(decimals => {
      const token = locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `token-${decimals}-${i}`,
      );
      threshold.push([
        token.address,
        new BigNumber(100).shiftedBy(decimals).toString(),
      ]);
    });
  });
  try {
    threshold.push([
      locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        `DexStablePool_lp`,
      ).address,
      new BigNumber(100).shiftedBy(Constants.LP_DECIMALS).toString(),
    ]);
  } catch (e) {}

  return threshold;
};

export const getWallet = async (user: Address, tokenRoot: Address) => {
  const token = locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    tokenRoot,
  );

  const ownerWalletAddress = (
    await token.methods
      .walletOf({
        answerId: 0,
        walletOwner: user,
      })
      .call()
  ).value0;

  const wallet = locklift.factory.getDeployedContract(
    "TokenWalletUpgradeable",
    ownerWalletAddress,
  );

  const isDeployed = await wallet.getFullState().then(s => {
    return s.state !== undefined && s.state.isDeployed;
  });

  return {
    isDeployed,
    walletContract: wallet,
  };
};

export const getDexAccountData = async (
  tokenRoot: Address[],
  dexAccount: Contract<DexAccountAbi>,
) => {
  return await Promise.all(
    tokenRoot.map(async _ => {
      return await dexAccount.methods
        .getWalletData({
          answerId: 0,
          token_root: _,
        })
        .call()
        .then(a => a.balance);
    }),
  );
};

export const setReferralProgramParams = async (
  projectId: string | number = "0",
  systemAddress: Address,
  projectAddress: Address,
) => {
  const dexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  return await dexVault.methods
    .setReferralProgramParams({
      params: {
        projectId,
        systemAddress,
        projectAddress,
      },
    })
    .send({
      from: mainAcc.address,
      amount: toNano(1),
    });
};

export const getExpectedTokenVault = async (root: Address) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  return await dexRoot.methods
    .getExpectedTokenVaultAddress({
      answerId: 0,
      _tokenRoot: root,
    })
    .call()
    .then(a => a.value0);
};

export const getDexData = async (tokens: Address[]) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");

  const tokensContracts = await Promise.all(
    tokens.map(async _ => {
      const tokenVaultAddress = (
        await dexRoot.methods
          .getExpectedTokenVaultAddress({
            answerId: 0,
            _tokenRoot: _,
          })
          .call()
      ).value0;
      const dexTokenVault = await locklift.factory.getDeployedContract(
        "DexTokenVault",
        tokenVaultAddress,
      );

      const tokenRoot = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        _,
      );
      const dexTokenWalletAddress = (
        await tokenRoot.methods
          .walletOf({ answerId: 0, walletOwner: dexTokenVault.address })
          .call()
      ).value0;

      const dexTokenVaultWallet = await locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        dexTokenWalletAddress,
      );

      return {
        dexTokenVaultWallet,
      };
    }),
  );

  const balances = Promise.all(
    tokensContracts.map(async _ => {
      const vaultBalance = await _.dexTokenVaultWallet.methods
        .balance({ answerId: 0 })
        .call()
        .then(a => a.value0);

      // const vaultTokenBalance = new BigNumber(
      //   (
      //     await item.dexTokenVaultWallet.methods
      //       .balance({ answerId: 0 })
      //       .call()
      //       .catch(() => {
      //         return { value0: "0" };
      //       })
      //   ).value0,
      // ).shiftedBy(-item.decimals);

      return vaultBalance.toString();
    }),
  );

  return balances;
};

export const transferWrapper = async (
  sender: Address,
  recipient: Address,
  deployWalletValue: string | number,
  transferData: ITokens[],
) => {
  for (let i = 0; i < transferData.length; i++) {
    const tokenRoot = locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      transferData[i].root,
    );

    const ownerWalletAddress = (
      await tokenRoot.methods
        .walletOf({
          answerId: 0,
          walletOwner: sender,
        })
        .call()
    ).value0;

    const ownerWallet = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      ownerWalletAddress,
    );

    await ownerWallet.methods
      .transfer({
        amount: transferData[i].amount,
        recipient: recipient,
        deployWalletValue: deployWalletValue,
        remainingGasTo: sender,
        notify: true,
        payload: null,
      })
      .send({
        from: sender,
        amount: toNano(2),
      });
  }
};

export const getPoolData = async (
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
) => {
  const balancesData = await poolContract.methods
    .getBalances({ answerId: 0 })
    .call();
  const tokenRoots = await poolContract.methods
    .getTokenRoots({ answerId: 0 })
    .call();
  const roots =
    "roots" in tokenRoots
      ? tokenRoots.roots.map(root => root.toString())
      : [tokenRoots.left.toString(), tokenRoots.right.toString()];

  const balances: Record<string, string> = {};

  if (balancesData.value0.hasOwnProperty("balances")) {
    (balancesData.value0 as IBalPool).balances.forEach(
      (bal, i) => (balances[roots[i]] = bal),
    );
  }

  if (balancesData.value0.hasOwnProperty("left_balance")) {
    balances[roots[0]] = (balancesData.value0 as IBalPair).left_balance;
    balances[roots[1]] = (balancesData.value0 as IBalPair).right_balance;
  }

  const fees: Record<string, string> = {};
  (
    await poolContract.methods.getAccumulatedFees({ answerId: 0 }).call()
  ).accumulatedFees.forEach((fee, i) => (fees[roots[i]] = fee));

  const FooBarLpRoot = locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    tokenRoots.lp,
  );

  const actualSupply = await FooBarLpRoot.methods
    .totalSupply({ answerId: 0 })
    .call();

  return {
    balances: balances,
    lpSupply: balancesData.value0.lp_supply,
    accumulatedFees: fees,
    actualTotalSupply: actualSupply.value0,
  };
};

export const depositLiquidity = async (
  dexOwner: Address,
  dexAccount: Contract<DexAccountAbi>,
  poolContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
  depositData: ITokens[],
) => {
  const tokenRoots: Address[] = depositData.map(_ => _.root);

  await locklift.transactions.waitFinalized(
    dexAccount.methods
      .addPool({
        _roots: tokenRoots,
      })
      .send({
        from: dexOwner,
        amount: toNano(5),
      }),
  );

  const FooBarLpRoot = locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    (await poolContract.methods.getTokenRoots({ answerId: 0 }).call()).lp,
  );

  await transferWrapper(dexOwner, dexAccount.address, 0, depositData);

  await locklift.transactions.waitFinalized(
    dexAccount.methods
      .depositLiquidityV2({
        _callId: getRandomNonce(),
        _operations: depositData,
        _expected: { amount: "0", root: FooBarLpRoot.address },
        _autoChange: false,
        _remainingGasTo: dexOwner,
        _referrer: zeroAddress,
      })
      .send({
        from: dexOwner,
        amount: toNano(4),
      }),
  );

  const poolBalances = await poolContract.methods
    .getBalances({ answerId: 0 })
    .call();

  console.log("Pool balances: ", poolBalances.value0);
};
