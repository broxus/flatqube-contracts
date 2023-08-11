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

export interface IDepositLiquidity {
  amounts: (string | number)[];
  lpReward: string;
  poolFees: string[];
  beneficiaryFees: string[];
  fees?: ITokens[];
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

export const getAccountData = async (
  tokenRoot: Address[],
  dexAccount: Address,
) => {
  const arrBalances = await Promise.all(
    tokenRoot.map(async _ => {
      const token = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        _,
      );

      const ownerWalletAddress = (
        await token.methods
          .walletOf({
            answerId: 0,
            walletOwner: dexAccount,
          })
          .call()
      ).value0;

      const wallet = locklift.factory.getDeployedContract(
        "TokenWalletUpgradeable",
        ownerWalletAddress,
      );

      const balance = await wallet.methods.balance({ answerId: 0 }).call();

      return balance.value0;
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

    ownerWallet.methods
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
  pairContract:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
) => {
  const balancesData = await pairContract.methods
    .getBalances({ answerId: 0 })
    .call();

  let balances: string[] = [];

  if (balancesData.value0.hasOwnProperty("balances")) {
    balances = (balancesData.value0 as IBalPool).balances;
  }

  if (balancesData.value0.hasOwnProperty("left_balance")) {
    const left = (balancesData.value0 as IBalPair).left_balance;
    const right = (balancesData.value0 as IBalPair).right_balance;
    balances = [left, right];
  }

  const fees = await pairContract.methods
    .getAccumulatedFees({ answerId: 0 })
    .call();

  const FooBarLpRoot = locklift.factory.getDeployedContract(
    "TokenRootUpgradeable",
    (await pairContract.methods.getTokenRoots({ answerId: 0 }).call()).lp,
  );

  const actualSupply = await FooBarLpRoot.methods
    .totalSupply({ answerId: 0 })
    .call();

  return {
    balances: balances,
    lpSupply: balancesData.value0.lp_supply,
    accumulatedFees: fees.accumulatedFees,
    actualTotalSupply: actualSupply.value0,
  };
};

export const depositLiquidity = async (
  dexOwner: Address,
  dexAccount: Contract<DexAccountAbi>,
  pairContract:
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

  const dexPairFooBar = pairContract;

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

  const pairBalances = await pairContract.methods
    .getBalances({ answerId: 0 })
    .call();

  console.log("Pair balances: ", pairBalances.value0);
};

export async function expectedDepositLiquidity(
  pairAddress: Address,
  contractName: "DexStablePool" | "DexStablePair" | "DexPair",
  tokens: ITokens[],
) {
  let depositLiquidity: IDepositLiquidity;

  if (contractName === "DexStablePool") {
    const pair = locklift.factory.getDeployedContract(
      contractName,
      pairAddress,
    );
    const tokenRoots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
    const amounts = tokenRoots.roots.map(_ => {
      return tokens.find(token => token.root.toString() === _.toString())
        .amount;
    });

    const expected = await pair.methods
      .expectedDepositLiquidityV2({ answerId: 0, amounts })
      .call()
      .then(r => r.value0);

    depositLiquidity = {
      lpReward: new BigNumber(expected.lp_reward).shiftedBy(-9).toString(),
      beneficiaryFees: expected.beneficiary_fees,
      poolFees: expected.pool_fees,
      amounts: amounts,
      fees: expected.pool_fees.map((_, key) => ({
        root: tokenRoots.roots[key],
        amount: _,
      })),
    };
  }

  if (contractName === "DexPair" || contractName === "DexStablePair") {
    const pair = locklift.factory.getDeployedContract(
      contractName,
      pairAddress,
    );
    const tokenRoots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
    const amounts = {
      left: tokens.find(
        token => token.root.toString() === tokenRoots.left.toString(),
      ).amount,
      right: tokens.find(
        token => token.root.toString() === tokenRoots.right.toString(),
      ).amount,
    };

    const expected = await pair.methods
      .expectedDepositLiquidity({
        answerId: 0,
        left_amount: amounts.left,
        right_amount: amounts.right,
        auto_change: false,
      })
      .call()
      .then(r => r.value0);

    depositLiquidity = {
      lpReward: new BigNumber(expected.step_3_lp_reward)
        .shiftedBy(-9)
        .toString(),
      beneficiaryFees: [expected.step_1_left_deposit, expected.step_2_fee],
      poolFees: [expected.step_1_left_deposit, expected.step_2_fee],
      amounts: [amounts.left, amounts.right],
    };
  }

  return depositLiquidity;
}

export async function expectedExchange(
  pairAddress: Address,
  contractName: "DexStablePool" | "DexStablePair" | "DexPair",
  spent_token_root: Address,
  receive_token_root: Address,
  amount: string,
) {
  let benFee = new BigNumber(0);
  let poolFee = new BigNumber(0);
  let result = "0";

  if (contractName === "DexStablePool") {
    const pair = locklift.factory.getDeployedContract(
      contractName,
      pairAddress,
    );

    const expected = await pair.methods
      .expectedExchange({
        answerId: 0,
        amount,
        spent_token_root,
        receive_token_root,
      })
      .call();

    const feesData = await pair.methods
      .getFeeParams({ answerId: 0 })
      .call()
      .then(r => r.value0);

    const numerator = new BigNumber(feesData.pool_numerator).plus(
      feesData.beneficiary_numerator,
    );

    benFee = new BigNumber(expected.expected_fee)
      .times(feesData.beneficiary_numerator)
      .div(numerator);
    poolFee = new BigNumber(expected.expected_fee).minus(benFee);
    result = new BigNumber(expected.expected_fee)
      .div(benFee)
      .div(poolFee)
      .toString();
  }

  return result;
}
