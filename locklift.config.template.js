module.exports = {
    compiler: {
        // Path to https://github.com/tonlabs/TON-Solidity-Compiler/tree/e66e9ac92997bee4ee3b7cd630926198ccac418f
        path: '/usr/bin/solc-everscale-e66e9ac9',
    },
    linker: {
        // Path to https://github.com/tonlabs/TVM-linker/tree/1a0e99b0a966f5bf16c50b75be5083b5067203c8
        path: '/usr/bin/tvm_linker-1a0e99b0',
    },
    networks: {
        // You can use TON labs graphql endpoints or local node
        local: {
            ton_client: {
                // See the TON client specification for all available options
                network: {
                    server_address: 'http://localhost/',
                },
            },
            // This giver is default local-node giver
            giver: {
                address: '0:841288ed3b55d9cdafa806807f02a0ae0c169aa5edfe88a789a6482429756a94',
                abi: {"ABI version": 1,
                    "functions": [{"name": "constructor", "inputs": [], "outputs": []}, {
                        "name": "sendGrams",
                        "inputs": [{"name": "dest", "type": "address"}, {"name": "amount", "type": "uint64"}],
                        "outputs": []
                    }],
                    "events": [],
                    "data": []
                },
                key: '',
            },
            // Use tonos-cli to generate your phrase
            // !!! Never commit it in your repos !!!
            keys: {
                phrase: '...',
                amount: 20,
            }
        },
    },
};
