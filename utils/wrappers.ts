import { Address, Contract, toNano } from "locklift";
import {
  DexRootAbi,
  DexVaultAbi,
  DexAccountAbi,
  DexPairAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
  TokenWalletUpgradeableAbi,
} from "../build/factorySource";
import { BigNumber } from "bignumber.js";

export interface IFee {
  denominator: number;
  pool_numerator: number;
  beneficiary_numerator: number;
  referrer_numerator: number;
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
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  await dexRoot.methods
    .setPairFeeParams({
      _roots: roots,
      _params: fees,
      _remainingGasTo: mainAcc.address,
    })
    .send({
      from: mainAcc.address,
      amount: toNano(1.5),
    });
};

export const createDexPair = async (
  left: Address,
  right: Address,
  fees: IFee,
) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployPair({
        left_root: left,
        right_root: right,
        send_gas_to: mainAcc.address,
      })
      .send({
        from: mainAcc.address,
        amount: toNano(15),
      }),
  );

  await setPairFeeParams([left, right], fees);

  const dexPairFooBarAddress = await dexRoot.methods
    .getExpectedPairAddress({
      answerId: 0,
      left_root: left,
      right_root: right,
    })
    .call()
    .then(r => r.value0);

  console.log(
    `DexPair_${left.toString()}_${right.toString()} deployed: ${dexPairFooBarAddress}`,
  );

  return dexPairFooBarAddress;
};

export const createStablePool = async (roots: Address[], fees: IFee) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  await locklift.transactions.waitFinalized(
    await dexRoot.methods
      .deployStablePool({
        roots,
        send_gas_to: mainAcc.address,
      })
      .send({
        from: mainAcc.address,
        amount: toNano(20),
      }),
  );

  await setPairFeeParams(roots, fees);

  const dexPoolAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: roots,
      })
      .call()
  ).value0;

  console.log(`Dex_Pool address created = ${dexPoolAddress}`);

  return dexPoolAddress;
};

export const deployDexAcc = async (user: Address) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  await locklift.transactions.waitFinalized(
    dexRoot.methods
      .deployAccount({
        account_owner: user,
        send_gas_to: mainAcc.address,
      })
      .send({
        from: mainAcc.address,
        amount: toNano(4),
      }),
  );

  const dexAccountAddress = (
    await dexRoot.methods
      .getExpectedAccountAddress({
        answerId: 0,
        account_owner: user,
      })
      .call()
  ).value0;

  return dexAccountAddress;
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
    return s.state.isDeployed;
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
  const arrBalances = await Promise.all(
    tokenRoot.map(async _ => {
      const balance = await dexAccount.methods
        .getWalletData({
          answerId: 0,
          token_root: _,
        })
        .call()
        .then(a => a.balance);

      return balance;
    }),
  );

  return arrBalances;
};

export const setReferralProgram = async (
  projectId = "0",
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

  const tokenVaultAddress = (
    await dexRoot.methods
      .getExpectedTokenVaultAddress({
        answerId: 0,
        _tokenRoot: root,
      })
      .call()
  ).value0;

  return tokenVaultAddress;
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

      const decimals = (
        await tokenRoot.methods.decimals({ answerId: 0 }).call()
      ).value0;

      const dexTokenVaultWallet = await locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        dexTokenWalletAddress,
      );

      return {
        dexTokenVaultWallet,
        decimals,
      };
    }),
  );

  const balances = Promise.all(
    tokensContracts.map(async _ => {
      const vaultBalance = new BigNumber(
        (
          await _.dexTokenVaultWallet.methods.balance({ answerId: 0 }).call()
        ).value0,
      ).shiftedBy(-_.decimals);

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
  const ownerWallets: Contract<TokenWalletUpgradeableAbi>[] = [];
  const tokenRoots: Address[] = depositData.map(_ => _.root);

  for (let i = 0; i < depositData.length; i++) {
    const tokenRoot = locklift.factory.getDeployedContract(
      "TokenRootUpgradeable",
      depositData[i].root,
    );

    const ownerWalletAddress = (
      await tokenRoot.methods
        .walletOf({
          answerId: 0,
          walletOwner: dexOwner,
        })
        .call()
    ).value0;

    const ownerWallet = locklift.factory.getDeployedContract(
      "TokenWalletUpgradeable",
      ownerWalletAddress,
    );

    ownerWallets.push(ownerWallet);
  }

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

  const dexPairFooBar = poolContract;

  const FooBarLpRoot = locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    (await dexPairFooBar.methods.getTokenRoots({ answerId: 0 }).call()).lp,
  );

  await transferWrapper(dexOwner, dexAccount.address, 0, depositData);

  await locklift.transactions.waitFinalized(
    dexAccount.methods
      .depositLiquidityV2({
        _callId: 123,
        _operations: depositData,
        _expected: { amount: "0", root: FooBarLpRoot.address },
        _autoChange: false,
        _remainingGasTo: dexOwner,
        _referrer: dexOwner,
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
