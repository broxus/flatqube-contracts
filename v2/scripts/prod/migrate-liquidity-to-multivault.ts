import {Contract, WalletTypes} from "locklift";
import {DexTokenVaultAbi, TokenRootAbi, TokenWalletAbi} from "../../../build/factorySource";
import {BigNumber} from "bignumber.js";

BigNumber.config({EXPONENTIAL_AT: 257});

const {displayTx} = require(process.cwd() + '/scripts/utils')
const {Migration} = require(process.cwd()+'/scripts/utils')

async function main() {
    const migration = new Migration();

    const dexRoot = await locklift.factory.getDeployedContract('DexRoot', migration.getAddress('DexRoot'));
    const dexVault = await locklift.factory.getDeployedContract('DexVault', migration.getAddress('DexVault'));
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
    console.log(`Load exists tokenRoots from DexVault`);

    const vaultWallets = (await dexVault.methods._vaultWallets({}).call())._vaultWallets;

    type Item = {
        symbol: string,
        decimals: number,
        tokenRoot: Contract<TokenRootAbi>;
        dexVaultWallet: Contract<TokenWalletAbi>;
        dexTokenVault: Contract<DexTokenVaultAbi>;
        dexTokenVaultWallet: Contract<TokenWalletAbi>;
    }

    let items: Item[] = [];

    for (let addrs of vaultWallets) {
        const tokenRoot = await locklift.factory.getDeployedContract('TokenRoot', addrs[0]);
        const dexVaultWallet = await locklift.factory.getDeployedContract('TokenWallet', addrs[1]);
        const tokenVaultAddress = (await dexRoot.methods.getExpectedTokenVaultAddress({ answerId: 0, _tokenRoot: tokenRoot.address }).call()).value0;
        const dexTokenVault = await locklift.factory.getDeployedContract('DexTokenVault', tokenVaultAddress);
        const dexTokenWalletAddress = (await tokenRoot.methods.walletOf({answerId:0, walletOwner: dexTokenVault.address}).call()).value0;
        const dexTokenVaultWallet = await locklift.factory.getDeployedContract('TokenWallet', dexTokenWalletAddress);
        const symbol = (await tokenRoot.methods.symbol({answerId: 0}).call()).value0;
        const decimals = (await tokenRoot.methods.decimals({answerId: 0}).call()).value0;

        items.push({
            tokenRoot,
            dexVaultWallet,
            dexTokenVault,
            dexTokenVaultWallet,
            symbol,
            decimals: parseInt(decimals)
        });
    }

    items.sort((a, b) => {
        return a.symbol > b.symbol ? 1 : -1;
    })

    async function balancesCheckpoint() {
        let tokens: any = {};
        const managerBalance = new BigNumber(await locklift.provider.getBalance(manager.address))
            .shiftedBy(-9)
            .toString();
        const ownerBalance = new BigNumber(await locklift.provider.getBalance(dexOwnerAddress))
            .shiftedBy(-9)
            .toString();
        let notDeployedVaultsCount = 0;
        for(let item of items) {
            let vaultBalance = new BigNumber(
                (await item.dexVaultWallet.methods.balance({answerId: 0}).call()).value0
            ).shiftedBy(-item.decimals);
            let vaultTokenBalance = new BigNumber(
                (await item.dexTokenVaultWallet.methods.balance({answerId: 0})
                    .call()
                    .catch(e => { return { value0: '0'  } })
                ).value0
            ).shiftedBy(-item.decimals);
            const vaultDeployed = (await item.dexTokenVault.getFullState()).state?.isDeployed;

            tokens[item.tokenRoot.address.toString()] = {
                vaultBalance,
                vaultTokenBalance,
                symbol: item.symbol,
                vaultDeployed
            };
            if (!vaultDeployed) {
                notDeployedVaultsCount++;
            }
        }
        return {
            managerBalance,
            ownerBalance,
            tokens,
            notDeployedVaultsCount
        };
    }

    function printBalances(balances: any, title: string) {
        console.log(`########################################`);
        console.log(`${title}`);
        console.log(`----------------------------------------`);
        console.log(`Owner(${dexOwnerAddress.toString()}) ${balances.ownerBalance} EVER`);
        console.log(`Manger(${manager.address.toString()}) ${balances.managerBalance} EVER`);

        console.log(`----------------------------------------`);
        console.log(`DexVault non-zero balances: `);
        for (let tokenRoot in balances.tokens) {
            if (new BigNumber(balances.tokens[tokenRoot].vaultBalance).gt(0)) {
                console.log(`${balances.tokens[tokenRoot].vaultBalance} ${balances.tokens[tokenRoot].symbol} (${tokenRoot})`);
            }
        }

        console.log(`----------------------------------------`);
        console.log(`DexTokenVaults non-zero balances: `);
        for (let tokenRoot in balances.tokens) {
            if (new BigNumber(balances.tokens[tokenRoot].vaultTokenBalance).gt(0)) {
             console.log(`${balances.tokens[tokenRoot].vaultTokenBalance} ${balances.tokens[tokenRoot].symbol} (${tokenRoot})`);
            }
        }
        console.log(`----------------------------------------`);
        console.log(`${balances.notDeployedVaultsCount} DexTokenVaults not deployed yet`);
        console.log(`########################################`);
    }

    const balancesStart = await balancesCheckpoint();
    await printBalances(balancesStart, 'Start balances:');

    const requiredBalance = new BigNumber(items.length).times(3.5).plus(1);

    if (requiredBalance.gt(balancesStart.managerBalance)) {
        console.error('Required ' + requiredBalance + ' EVER for this operation');
    } else {
        console.log(``);
        console.log(`DexVault.migrateLiquidity()`);
        const tx = await locklift.transactions.waitFinalized(dexVault.methods.migrateLiquidity({}).send({
            from: manager.address,
            amount: requiredBalance.shiftedBy(9).toString(),
            bounce: true
        }));
        displayTx(tx);

        const balancesEnd = await balancesCheckpoint();
        await printBalances(balancesEnd, 'End balances:');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });

