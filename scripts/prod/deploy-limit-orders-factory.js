const { Command } = require('commander');

const logger = require('mocha-logger');
const program = new Command();
const prompts = require('prompts');

const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);

async function main() {
    const [keyPair] = await locklift.keys.getKeyPairs();
const promptsData = [];

    program
        .allowUnknownOption()
        .option('-owneraddress', '--owneraddress <OwnerAddress>', 'owner');

    program.parse(process.argv);  
    
    const options = program.opts();

    if (!isValidTonAddress(options.weverroot)) {
        promptsData.push({
            type: 'text',
            name: 'ownerAddress',
            message: 'WEVER Root',
            validate: value => isValidTonAddress(value) ? true : 'Invalid Ever address'
        })
    }

    const response = await prompts(promptsData);
    ownerAddress = options.owneraddress || response.ownerAddress;

       const LimitOrdersFactory =  await locklift.factory.getContract('LimitOrdersFactory');
       const LimitOrdersRoot =  await locklift.factory.getContract('LimitOrdersRoot');

     let everTip3 = await locklift.giver.deployContract({
         contract: LimitOrdersFactory,
        constructorParams: {
            owner: ownerAddress,
        },
        initParams: {
            randomNonce_: Math.random() * 6400 | 0,
            limitOrdersRootCode: LimitOrdersRoot.code,   
        },
        keyPair,
    }, locklift.utils.convertCrystal('2', 'nano'));
}

main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
