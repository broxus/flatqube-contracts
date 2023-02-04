import {toNano} from "locklift";
const {displayTx} = require(process.cwd() + '/scripts/utils');
const {WalletTypes, Address} = require("locklift");
const {Migration} = require(process.cwd()+'/scripts/utils');

async function main() {

    const USDT_USDC_LP_ROOT = "0:1ddd1a0a7d6ee3cef8ccb9e6aa02f5c142658522ddd40f21ae7160177ced0e12"

    const migration = new Migration();

    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));
    const dexVault = await locklift.factory.getDeployedContract('DexVaultPrev', migration.getAddress('DexVault'));
    const dexOwnerAddress = (await dexVault.methods.getOwner({answerId: 0}).call()).value0;
    const dexManagerAddress = (await dexVault.methods.getManager({answerId: 0}).call()).value0;
    const manager = await locklift.factory.accounts.addExistingAccount({
        type: WalletTypes.EverWallet,
        address: dexManagerAddress
    });

    console.log('DexRoot: ' + dexRoot.address);
    console.log('DexVault: ' + dexVault.address);
    console.log('Dex Owner: ' + dexOwnerAddress);
    console.log('Dex Manager: ' + manager.address);
    console.log(`FlatQube-LP-USDT-USDC: ${USDT_USDC_LP_ROOT}`);

    const tokenRoot = await locklift.factory.getDeployedContract('TokenRootUpgradeable', new Address(USDT_USDC_LP_ROOT));
    const tokenWalletAddress = (await tokenRoot.methods.walletOf({answerId:0, walletOwner: dexVault.address}).call()).value0;

    console.log(`DexVault wallet address for FlatQube-LP-USDT-USDC: ${tokenWalletAddress.toString()}`);

    const vaultWalletsStart = (await dexVault.methods._vaultWallets({}).call())._vaultWallets;
    console.log('Wallets start length' + vaultWalletsStart.length);

    console.log(`Add wallet info to addVaultWallets`);
    let tx = await locklift.transactions.waitFinalized(dexVault.methods.addVaultWallets({
        _tokenRoots: [new Address(USDT_USDC_LP_ROOT)],
        _tokenWallets: [tokenWalletAddress]
    }).send({
        from: manager.address,
        amount: toNano(1)
    }));
    displayTx(tx);

    const vaultWalletsEnd = (await dexVault.methods._vaultWallets({}).call())._vaultWallets;
    console.log('Wallets end length' + vaultWalletsEnd.length);
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });

