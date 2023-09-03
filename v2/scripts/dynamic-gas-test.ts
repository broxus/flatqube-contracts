import { Constants, TTokenName } from "../../utils/consts";
import { toNano, zeroAddress } from "locklift";
import {
  deployProject,
  deployRefFactory,
  deployRefSystem,
} from "../../utils/oldUtils/ref";
import {
  DexStablePoolAbi,
  DexVaultAbi,
  TokenRootUpgradeableAbi,
} from "build/factorySource";

const deposits = [
  { tokenId: "foo", amount: "100000000000000000000000" },
  { tokenId: "bar", amount: "100000000000000000000000" },
  { tokenId: "qwe", amount: "100000000000000000000000" },
  { tokenId: "tst", amount: "100000000000000000000000" },
  { tokenId: "coin", amount: "100000000000000000000000" },
];

async function main() {
  const mainAccount = locklift.deployments.getAccount("Account1").account;
  const additionalAccount = locklift.deployments.getAccount("Account3").account;
  const owner = locklift.deployments.getAccount("Account2").account;
  const emptyAccount = locklift.deployments.getAccount("Account4").account;

  const DexVault = locklift.deployments.getContract<DexVaultAbi>("DexVault");

  //   const dexAccountN = migration.loadContract("DexAccount", "DexAccount" + 2);
  const dexPool =
    locklift.deployments.getContract<DexStablePoolAbi>("DexPoolFooBarQwe");
  const poolLpRoot =
    locklift.deployments.getContract<TokenRootUpgradeableAbi>(
      "FooBarQweLpRoot",
    );

  const token_roots = [];
  const symbols = [];
  for (const deposit of deposits) {
    const symbol = Constants.tokens[deposit.tokenId as TTokenName].symbol;
    symbols.push(symbol);
    token_roots.push(
      locklift.deployments.getContract<TokenRootUpgradeableAbi>(
        symbol + "Root",
      ),
    );
  }

  const accountWalletFoo = await locklift.factory.getDeployedContract(
    "TokenWalletUpgradeable",
    (
      await token_roots[0].methods
        .walletOf({
          answerId: 0,
          walletOwner: owner.address,
        })
        .call()
    ).value0,
  );

  //   const accountWalletLp = await locklift.factory.getDeployedContract(
  //     "TokenWalletUpgradeable",
  //     (
  //       await poolLpRoot.methods
  //         .walletOf({
  //           answerId: 0,
  //           walletOwner: owner.address,
  //         })
  //         .call()
  //     ).value0,
  //   );

  const refFactory = await deployRefFactory(mainAccount);
  console.log("RefFactory:", refFactory.address);

  await locklift.deployments.saveContract({
    contractName: "RefFactory",
    deploymentName: "RefFactory",
    address: refFactory.address,
  });

  await refFactory.methods
    .setManager({ newManager: DexVault.address })
    .send({ from: mainAccount.address, amount: toNano(0.8) });

  // refSysOwner = Account2;
  const refSystem = await deployRefSystem(mainAccount, refFactory, owner, 300);
  console.log("RefSystem:", refSystem.address);

  await locklift.deployments.saveContract({
    contractName: "RefSystem",
    deploymentName: "RefSystem",
    address: refSystem.address,
  });

  //   const { value0: refSysAccountAddr } = await refSystem.methods
  //     .deriveRefAccount({ answerId: 0, owner: additionalAccount.address })
  //     .call();
  //   const refSysAccount = locklift.factory.getDeployedContract(
  //     "RefAccount",
  //     refSysAccountAddr,
  //   );

  // projectOwner = account3
  const project = await deployProject(additionalAccount, refSystem, 5, 5);
  console.log("Project:", project.address);
  await locklift.deployments.saveContract({
    contractName: "Project",
    deploymentName: "Project",
    address: project.address,
  });

  await project.methods
    .setManager({
      manager: DexVault.address,
    })
    .send({ from: additionalAccount.address, amount: toNano(0.6) });

  await refSystem.methods
    .setProjectApproval({ projectId: 0, value: true })
    .send({ from: owner.address, amount: toNano(0.6) });

  await DexVault.methods
    .setReferralProgramParams({
      params: {
        projectId: 0,
        projectAddress: project.address,
        systemAddress: refSystem.address,
      },
    })
    .send({
      from: mainAccount.address,
      amount: toNano(1),
    });

  // let payload = (await dexPool.methods.buildExchangePayload({
  //     id: 0,
  //     deploy_wallet_grams: 0,
  //     expected_amount: 0,
  //     outcoming: token_roots[1].address,
  //     recipient: owner.address,
  //     referrer: additionalAccount.address,
  //     success_payload: null,
  //     cancel_payload: null
  // }).call()).value0;
  //
  // let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
  //     amount: '100000000000000000000',
  //     recipient: dexPool.address,
  //     deployWalletValue: 0,
  //     remainingGasTo: owner.address,
  //     notify: true,
  //     payload: payload,
  //     // @ts-ignore
  // }).send({
  //     from: owner.address,
  //     amount: toNano(4),
  // }));

  // let payload = (await dexPool.methods.buildDepositLiquidityPayload({
  //     id: 0,
  //     deploy_wallet_grams: 0,
  //     expected_amount: 0,
  //     recipient: owner.address,
  //     referrer: zeroAddress,
  //     success_payload: null,
  //     cancel_payload: null
  // }).call()).value0;
  //
  // let { traceTree } = await locklift.tracing.trace(accountWalletFoo.methods.transfer({
  //     amount: '100000000000000000000',
  //     recipient: dexPool.address,
  //     deployWalletValue: 0,
  //     remainingGasTo: owner.address,
  //     notify: true,
  //     payload: payload,
  //     // @ts-ignore
  // }).send({
  //     from: owner.address,
  //     amount: toNano(3),
  // }));

  // let payload = (await dexPool.methods.buildWithdrawLiquidityPayload({
  //     id: 0,
  //     deploy_wallet_grams: 0,
  //     expected_amounts: [],
  //     recipient: owner.address,
  //     referrer: zeroAddress,
  //     success_payload: null,
  //     cancel_payload: null
  // }).call()).value0;
  //
  // let { traceTree } = await locklift.tracing.trace(accountWalletLp.methods.transfer({
  //     amount: '100000000000',
  //     recipient: dexPool.address,
  //     deployWalletValue: 0,
  //     remainingGasTo: owner.address,
  //     notify: true,
  //     payload: payload,
  //     // @ts-ignore
  // }).send({
  //     from: owner.address,
  //     amount: toNano(3),
  // }));

  // let payload = (await dexPool.methods.buildWithdrawLiquidityOneCoinPayload({
  //     id: 0,
  //     deploy_wallet_grams: 0,
  //     expected_amount: 0,
  //     outcoming: token_roots[0].address,
  //     recipient: owner.address,
  //     referrer: zeroAddress,
  //     success_payload: null,
  //     cancel_payload: null
  // }).call()).value0;
  //
  // let { traceTree } = await locklift.tracing.trace(accountWalletLp.methods.transfer({
  //     amount: '100000000000',
  //     recipient: dexPool.address,
  //     deployWalletValue: 0,
  //     remainingGasTo: owner.address,
  //     notify: true,
  //     payload: payload,
  //     // @ts-ignore
  // }).send({
  //     from: owner.address,
  //     amount: toNano(3),
  // }));

  const steps = [
    {
      amount: 0,
      roots: [poolLpRoot.address, token_roots[3].address],
      outcoming: zeroAddress,
      numerator: 1,
      nextStepIndices: [1],
    },
    {
      amount: 0,
      roots: [token_roots[1].address, token_roots[3].address],
      outcoming: zeroAddress,
      numerator: 1,
      nextStepIndices: [2],
    },
    {
      amount: 0,
      roots: [token_roots[1].address, token_roots[4].address],
      outcoming: zeroAddress,
      numerator: 1,
      nextStepIndices: [],
    },
  ];

  // const dexPair = migration.loadContract('DexPair', 'DexPoolTstFoo');
  const payload = (
    await dexPool.methods
      .buildCrossPairExchangePayload({
        id: 0,
        deployWalletGrams: toNano(0.1),
        expectedAmount: 0,
        outcoming: poolLpRoot.address,
        nextStepIndices: [0],
        steps: steps,
        recipient: emptyAccount.address,
        referrer: additionalAccount.address,
        success_payload: null,
        cancel_payload: null,
      })
      .call()
  ).value0;

  const { traceTree } = await locklift.tracing.trace(
    accountWalletFoo.methods
      .transfer({
        amount: "100000000000000000000",
        recipient: dexPool.address,
        deployWalletValue: 0,
        remainingGasTo: owner.address,
        notify: true,
        payload: payload,
      })
      .send({
        from: owner.address,
        amount: toNano(10),
      }),
  );
  //
  // displayTx(tx);

  await traceTree?.beautyPrint();

  console.log("balanceChangeInfo");

  for (const addr in traceTree?.balanceChangeInfo) {
    console.log(
      addr +
        ": " +
        traceTree?.balanceChangeInfo[addr].balanceDiff.shiftedBy(-9).toString(),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
