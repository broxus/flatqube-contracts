import { Address, toNano, zeroAddress } from "locklift";
import { BigNumber } from "bignumber.js";
import { DexRootAbi } from "../build/factorySource";
import { IFee, setPairFeeParams } from "./wrappers";

export const deployToken = async (
  name: string,
  symbol: string,
  amount: string | number = "100000",
  decimals = 18,
) => {
  const account = locklift.deployments.getAccount("DexOwner");
  const owner = account.account;

  const TokenWallet = locklift.factory.getContractArtifacts(
    "TokenWalletUpgradeable",
  );
  const TokenWalletPlatform = locklift.factory.getContractArtifacts(
    "TokenWalletPlatform",
  );

  const token = await locklift.transactions.waitFinalized(
    locklift.deployments.deploy({
      deployConfig: {
        contract: "TokenRootUpgradeable",
        publicKey: account.signer.publicKey,
        initParams: {
          randomNonce_: locklift.utils.getRandomNonce(),
          deployer_: zeroAddress,
          name_: name,
          symbol_: symbol,
          decimals_: decimals,
          walletCode_: TokenWallet.code,
          rootOwner_: owner.address,
          platformCode_: TokenWalletPlatform.code,
        },
        constructorParams: {
          initialSupplyTo: owner.address,
          initialSupply: new BigNumber(amount).shiftedBy(decimals).toString(),
          deployWalletValue: toNano(0.1),
          mintDisabled: false,
          burnByRootDisabled: false,
          burnPaused: false,
          remainingGasTo: owner.address,
        },
        value: toNano(10),
      },
      deploymentName: `token-${symbol}`,
      enableLogs: true,
    }),
  );

  return token.extTransaction.contract.address;
};

export const createDexPair = async (
  left: Address,
  right: Address,
  fees?: IFee,
) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  const tx = await locklift.transactions.waitFinalized(
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

  if (fees) {
    await setPairFeeParams([left, right], fees);
  }

  const dexPairAddress = await dexRoot.methods
    .getExpectedPairAddress({
      answerId: 0,
      left_root: left,
      right_root: right,
    })
    .call()
    .then(r => r.value0);

  return { address: dexPairAddress, tx: tx.extTransaction };
};

export const createStablePool = async (roots: Address[], fees?: IFee) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  const tx = await locklift.transactions.waitFinalized(
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

  if (fees) {
    await setPairFeeParams(roots, fees);
  }

  const dexPoolAddress = (
    await dexRoot.methods
      .getExpectedPoolAddress({
        answerId: 0,
        _roots: roots,
      })
      .call()
  ).value0;

  return { address: dexPoolAddress, tx: tx.extTransaction };
};

export const deployDexAccount = async (user: Address) => {
  const dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
  const mainAcc = locklift.deployments.getAccount("DexOwner").account;

  const tx = await dexRoot.methods
    .deployAccount({
      account_owner: user,
      send_gas_to: mainAcc.address,
    })
    .send({
      from: mainAcc.address,
      amount: toNano(4),
    });

  const dexAccountAddress = (
    await dexRoot.methods
      .getExpectedAccountAddress({
        answerId: 0,
        account_owner: user,
      })
      .call()
  ).value0;

  return { address: dexAccountAddress, tx: tx };
};
