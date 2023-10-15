import { Contract, toNano, zeroAddress } from "locklift";
import { TokenFactoryAbi } from "../build/factorySource";
import { Account } from "locklift/everscale-client";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";
import { getWallet } from "../utils/wrappers";

describe("TokenFactory contract", () => {
  let owner: Account;

  let tokenFactory: Contract<TokenFactoryAbi>;

  before(async () => {
    await locklift.deployments.fixture({ include: ["token-factory"] });
    owner = locklift.deployments.getAccount("DexOwner").account;

    tokenFactory =
      locklift.deployments.getContract<TokenFactoryAbi>("TokenFactory");
  });

  it("Check deployed contracts", async () => {
    let rootCode = await tokenFactory.methods
      .rootCode({ answerId: 0 })
      .call()
      .then(a => a.value0);

    expect(rootCode).to.equal(
      locklift.factory.getContractArtifacts("TokenRootUpgradeable").code,
      "Wrong token root code",
    );

    let walletCode = await tokenFactory.methods
      .walletCode({ answerId: 0 })
      .call()
      .then(a => a.value0);

    expect(walletCode).to.equal(
      locklift.factory.getContractArtifacts("TokenWalletUpgradeable").code,
      "Wrong token wallet code",
    );

    let walletPlatformCode = await tokenFactory.methods
      .walletPlatformCode({ answerId: 0 })
      .call()
      .then(a => a.value0);

    expect(walletPlatformCode).to.equal(
      locklift.factory.getContractArtifacts("TokenWalletPlatform").code,
      "Wrong platform code",
    );
  });

  it("Interact with contract", async () => {
    let tokensToCreate = [
      {
        name: "Test 1",
        symbol: "TST1",
        decimals: 3,
        owner: owner.address,
        amount: 10,
        mintDisabled: false,
        burnByRootDisabled: false,
        burnPaused: false,
        initialSupplyTo: zeroAddress,
        initialSupply: "0",
        deployWalletValue: "0",
      },
      {
        name: "Test 2",
        symbol: "TST2",
        decimals: 4,
        owner: owner.address,
        amount: 10,
        mintDisabled: true,
        burnByRootDisabled: true,
        burnPaused: true,
        initialSupplyTo: owner.address,
        initialSupply: "100",
        deployWalletValue: toNano(0.1),
      },
    ];

    for (const tokenData of tokensToCreate) {
      let index = tokensToCreate.indexOf(tokenData);

      const { traceTree } = await locklift.tracing.trace(
        tokenFactory.methods
          .createToken({
            callId: index,
            name: tokenData.name,
            symbol: tokenData.symbol,
            decimals: tokenData.decimals,
            initialSupplyTo: tokenData.initialSupplyTo,
            initialSupply: new BigNumber(tokenData.initialSupply)
              .shiftedBy(tokenData.decimals)
              .toString(),
            deployWalletValue: tokenData.deployWalletValue,
            mintDisabled: tokenData.mintDisabled,
            burnByRootDisabled: tokenData.burnByRootDisabled,
            burnPaused: tokenData.burnPaused,
            remainingGasTo: owner.address,
          })
          .send({ from: owner.address, amount: toNano(3) }),
      );

      let tokenRootAddress = traceTree?.findEventsForContract({
        contract: tokenFactory,
        name: "TokenCreated" as const,
      })[0].tokenRoot;

      expect(tokenRootAddress.toString()).not.equal(
        zeroAddress.toString(),
        "Bad Token Root address",
      );

      let tokenRoot = locklift.factory.getDeployedContract(
        "TokenRootUpgradeable",
        tokenRootAddress,
      );

      const name = await tokenRoot.methods
        .name({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const symbol = await tokenRoot.methods
        .symbol({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const decimals = await tokenRoot.methods
        .decimals({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const rootOwner = await tokenRoot.methods
        .rootOwner({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const mintDisabled = await tokenRoot.methods
        .mintDisabled({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const burnByRootDisabled = await tokenRoot.methods
        .burnByRootDisabled({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const burnPaused = await tokenRoot.methods
        .burnPaused({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const walletCode = await tokenRoot.methods
        .walletCode({ answerId: 0 })
        .call()
        .then(a => a.value0);
      const platformCode = await tokenRoot.methods
        .platformCode({ answerId: 0 })
        .call()
        .then(a => a.value0);

      if (!tokenData.initialSupplyTo.equals(zeroAddress)) {
        const totalSupply = await tokenRoot.methods
          .totalSupply({ answerId: 0 })
          .call()
          .then(a => a.value0);

        const tokenWallet = await getWallet(
          tokenData.initialSupplyTo,
          tokenRoot.address,
        ).then(a => a.walletContract);

        const balance = await tokenWallet.methods
          .balance({ answerId: 0 })
          .call()
          .then(a => a.value0);

        expect(
          new BigNumber(tokenData.initialSupply)
            .shiftedBy(tokenData.decimals)
            .toString(),
        ).to.equal(
          totalSupply.toString(),
          "Wrong totalSupply in deployed Token",
        );
        expect(
          new BigNumber(tokenData.initialSupply)
            .shiftedBy(tokenData.decimals)
            .toString(),
        ).to.equal(balance.toString(), "Wrong initialSupply of deployed Token");
      }

      expect(name).to.equal(
        tokenData.name,
        "Wrong Token name in deployed Token",
      );
      expect(symbol).to.equal(
        tokenData.symbol,
        "Wrong Token symbol in deployed Token",
      );
      expect(decimals).to.equal(
        tokenData.decimals.toString(),
        "Wrong Token decimals in deployed Token",
      );
      expect(rootOwner.toString()).to.equal(
        tokenData.owner.toString(),
        "Wrong Token owner in deployed Token",
      );
      expect(mintDisabled).to.equal(
        tokenData.mintDisabled,
        "Wrong Token owner in deployed Token",
      );
      expect(burnByRootDisabled).to.equal(
        tokenData.burnByRootDisabled,
        "Wrong Token owner in deployed Token",
      );
      expect(burnPaused).to.equal(
        tokenData.burnPaused,
        "Wrong Token owner in deployed Token",
      );
      expect(walletCode).to.equal(
        locklift.factory.getContractArtifacts("TokenWalletUpgradeable").code,
        "Wrong Token Wallet code in deployed Token",
      );
      expect(platformCode).to.equal(
        locklift.factory.getContractArtifacts("TokenWalletPlatform").code,
        "Wrong Platform code in deployed Token",
      );
    }
  });
});
