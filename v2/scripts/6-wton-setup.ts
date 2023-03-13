import {Migration, displayTx, Constants} from '../utils/migration';
import {toNano, zeroAddress, getRandomNonce} from "locklift";
import { Command } from 'commander';

const logger = require('mocha-logger');
const BigNumber = require('bignumber.js');
BigNumber.config({ EXPONENTIAL_AT: 257 });

const program = new Command();

let tx;

async function main() {
    const migration = new Migration();

    program
        .allowUnknownOption()
        .option('-wa, --wrap_amount <wrap_amount>', 'wrap amount');

    program.parse(process.argv);

    const options = program.opts();
    options.wrap_amount = options.wrap_amount || '60';

    const tokenData = Constants.tokens['wever'];


    logger.log(`Giver balance: ${toNano(await locklift.provider.getBalance(locklift.giver.giverContract.address), 'ever')}`);

    const signer = await locklift.keystore.getSigner('1');
    const Account2 = await migration.loadAccount('Account2', '1');

    logger.success(`Owner: ${Account2.address}`);


    logger.log(`Deploying tunnel`);

    const {contract: tunnel} = await locklift.factory.deployContract({
        contract: 'TestWeverTunnel',
        constructorParams: {
            sources: [],
            destinations: [],
            owner_: Account2.address,
        },
        initParams: {
            _randomNonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(5)
    });

    logger.success(`Tunnel address: ${tunnel.address}`);
    migration.store(tunnel, `${tokenData.symbol}Tunnel`);

    logger.log(`Deploying WEVER`);

    const TokenWallet = await locklift.factory.getContractArtifacts('TokenWalletUpgradeable');

    const TokenWalletPlatform = await locklift.factory.getContractArtifacts('TokenWalletPlatform');

    const {contract: root} = await locklift.factory.deployContract({
        contract: 'TokenRootUpgradeable',
        constructorParams: {
            initialSupplyTo: zeroAddress,
            initialSupply: '0',
            deployWalletValue: '0',
            mintDisabled: false,
            burnByRootDisabled: false,
            burnPaused: false,
            remainingGasTo: zeroAddress
        },
        initParams: {
            randomNonce_: getRandomNonce(),
            deployer_: zeroAddress,
            name_: tokenData.name,
            symbol_: tokenData.symbol,
            decimals_: tokenData.decimals,
            walletCode_: TokenWallet.code,
            rootOwner_: tunnel.address,
            platformCode_: TokenWalletPlatform.code
        },
        publicKey: signer.publicKey,
        value: toNano(3)
    });

    logger.success(`WEVER root: ${root.address}`);
    migration.store(root, `${tokenData.symbol}Root`);

    logger.log(`Deploying vault`);

    const {contract: vault} = await locklift.factory.deployContract({
        contract: 'TestWeverVault',
        constructorParams: {
            owner_: Account2.address,
            root_tunnel: tunnel.address,
            root: root.address,
            receive_safe_fee: toNano(1),
            settings_deploy_wallet_grams: toNano(0.1),
            initial_balance: toNano(1)
        },
        initParams: {
            _randomNonce: getRandomNonce(),
        },
        publicKey: signer.publicKey,
        value: toNano(3)
    });

    logger.success(`Vault address: ${vault.address}`);
    migration.store(vault, `${tokenData.symbol}Vault`);

    logger.log(`Adding tunnel (vault, root)`);

    tx = await tunnel.methods.__updateTunnel({
        source: vault.address,
        destination: root.address,
    }).send({
        from: Account2.address,
        amount: toNano(2)
    });

    displayTx(tx);

    logger.log(`Draining vault`);

    tx = await vault.methods.drain({
        receiver: Account2.address
    }).send({
        from: Account2.address,
        amount: toNano(2)
    });

    displayTx(tx);

    logger.log(`Wrap ${options.wrap_amount} EVER`);

    await locklift.provider.sendMessage({
        sender: Account2.address,
        recipient: vault.address,
        amount: toNano(options.wrap_amount),
        bounce: false
    });

    const tokenWalletAddress = (await root.methods.walletOf({answerId: 0, walletOwner: Account2.address}).call()).value0;

    const tokenWallet = await locklift.factory.getDeployedContract('TokenWalletUpgradeable', tokenWalletAddress);
    migration.store(tokenWallet, tokenData.symbol + 'Wallet2');

    const balance = new BigNumber((await tokenWallet.methods.balance({answerId: 0}).call()).value0).shiftedBy(-9).toString();
    logger.log(`Account2 WEVER balance: ${balance}`);

    logger.log(`Giver balance: ${toNano(await locklift.provider.getBalance(locklift.giver.giverContract.address), 'ever')}`);
}


main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
