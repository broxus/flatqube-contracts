import {toNano, WalletTypes, zeroAddress, getRandomNonce} from "locklift";

const {
    Migration,
    Constants,
} = require(process.cwd() + '/scripts/utils');
const {Command} = require('commander');
const program = new Command();

async function main() {
    const migration = new Migration();

    const signer = await locklift.keystore.getSigner('0');
    const account = await locklift.factory.accounts.addExistingAccount({type: WalletTypes.WalletV3, publicKey: signer!.publicKey});
    if (locklift.tracing) {
        locklift.tracing.setAllowedCodesForAddress(account.address, {compute: [100]});
    }

    program
        .allowUnknownOption()
        .option('-t, --tokens <tokens>', 'tokens to deploy');

    program.parse(process.argv);

    const options = program.opts();

    let tokens = options.tokens ? JSON.parse(options.tokens) : ['foo', 'bar', 'tst'];

    const TokenWalletUpgradeable = await locklift.factory.getContractArtifacts('TokenWalletUpgradeable');
    const TokenWalletPlatform = await locklift.factory.getContractArtifacts('TokenWalletPlatform');
    const TokenRoot = await locklift.factory.getContractArtifacts('TokenRoot');
    const TokenWallet = await locklift.factory.getContractArtifacts('TokenWallet');

    for (const tokenId of tokens) {
        const tokenData = Constants.tokens[tokenId];
        const {contract: tokenRoot} = await locklift.factory.deployContract({
            contract: tokenData.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot',
            constructorParams: {
                initialSupplyTo: zeroAddress,
                initialSupply: '0',
                deployWalletValue: '0',
                mintDisabled: false,
                burnByRootDisabled: true,
                burnPaused: true,
                remainingGasTo: zeroAddress
            },
            initParams: {
                randomNonce_: getRandomNonce(),
                deployer_: zeroAddress,
                name_: tokenData.name,
                symbol_: tokenData.symbol,
                decimals_: tokenData.decimals,
                walletCode_: tokenData.upgradeable ? TokenWalletUpgradeable.code : TokenWallet.code,
                rootOwner_: account.address,
                platformCode_: tokenData.upgradeable ? TokenWalletPlatform.code : undefined
            },
            publicKey: signer!.publicKey,
            value: toNano(3),
        });

        console.log(`Token ${tokenData.name}: ${tokenRoot.address}`)
        migration.store({
            name: tokenData.symbol + 'Root',
            address: tokenRoot.address,
        }, `${tokenData.symbol}Root`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
