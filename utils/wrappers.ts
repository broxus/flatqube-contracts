import { Address, toNano } from "locklift";
import { DexRootAbi, DexVaultAbi } from "../build/factorySource";
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
  console.log("getWallet");
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
    walletContract: ownerWalletAddress,
  };
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
