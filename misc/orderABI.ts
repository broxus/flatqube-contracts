export class OrderCallbacks {
    static Callbacks = {
        'ABI version': 2,
        header: ['time'],
        "functions" : [
            {
                name: "onOrderPartExchangeSuccess",
                inputs: [
                    { name: 'id', type: 'uint64'},
                    { name: 'result',
                        components: [
                            { name: 'spentToken', type: 'address'},
                            { name: 'spentAmount', type: 'uint128'},
                            { name: 'receiveToken', type: 'address'},
                            { name: 'receiveAmount', type: 'uint128'},
                            { name: 'currentSpentTokenAmount', type: 'uint128'},
                            { name: 'currentReceiveTokenAmount', type: 'uint128'},
                        ],
                        type: 'tuple'},
                ],
                outputs: []
            },
            {
                name: "onOrderStateChangedSuccess",
                inputs: [
                    { name: 'id', type: 'uint64'},
                    { name: 'result',
                        components: [
                            { name: 'from', type: 'uint8' },
                            { name: 'to', type: 'uint8'},
                            { name: 'details',
                                components: [
                                    { name: 'root', type: 'address' },
                                    { name: 'owner', type: 'address' },
                                    { name: 'backPK', type: 'uint256' },
                                    { name: 'dexRoot', type: 'address' },
                                    { name: 'dexPair', type: 'address' },
                                    { name: 'msgSender', type: 'address' },
                                    { name: 'swapAttempt', type: 'uint64' },
                                    { name: 'state', type: 'uint8' },
                                    { name: 'spentToken', type: 'address' },
                                    { name: 'receiveToken', type: 'address' },
                                    { name: 'spentWallet', type: 'address' },
                                    { name: 'receiveWallet', type: 'address' },
                                    { name: 'expectedAmount', type: 'uint128' },
                                    { name: 'initialAmount', type: 'uint128' },
                                    { name: 'currentAmountSpentToken', type: 'uint128' },
                                    { name: 'currentAmountReceiveToken', type: 'uint128' },
                                ],
                                type: 'tuple'}
                        ],
                        type: 'tuple'},
                ],
                outputs: []
            },
            {
                name: "onOrderSwapSuccess",
                inputs: [
                    { name: 'id', type: 'uint64'},
                    { name: 'result',
                        components: [
                            { name: 'initiator', type: 'address' },
                            { name: 'deployWalletValue', type: 'uint128'},
                        ],
                        type: 'tuple' },
                ],
                outputs: []
            },
            {
                name: "onOrderSwapCancel",
                inputs: [
                    { name: 'id', type: 'uint64' },
                ],
                outputs: []
            },
            {
                name: "onOrderCreateOrderSuccess",
                inputs: [
                    { name: 'id', type: 'uint64' },
                    { name: 'result',
                        components: [
                            { name: 'order', type: 'address' },
                            { name: 'spentToken', type: 'address' },
                            { name: 'spentAmount', type: 'uint128' },
                            { name: 'receiveToken', type: 'address' },
                            { name: 'expectedAmount', type: 'uint128' },
                        ],
                        type: 'tuple' },
                ],
                outputs: []
            },
            {
                name: "onOrderCreateOrderReject",
                inputs: [
                    { name: 'id', type: 'uint64' },
                    { name: 'result',
                        components: [
                            { name: 'spentToken', type: 'address' },
                            { name: 'spentAmount', type: 'uint128' },
                            { name: 'receiveToken', type: 'address' },
                            { name: 'expectedAmount', type: 'uint128' },
                        ],
                        type: 'tuple' },
                ],
                outputs: []
            },
            {
                name: "onOrderRootCreateSuccess",
                inputs: [
                    { name: 'id', type: 'uint64' },
                    { name: 'result',
                        components: [
                            { name: 'factory', type: 'address' },
                            { name: 'spentToken', type: 'address' },
                            { name: 'oldVersion', type: 'uint32' },
                            { name: 'newVersion', type: 'uint32' },
                            { name: 'deployer', type: 'address' },
                        ],
                        type: 'tuple' },
                ],
                outputs: []
            },
        ],
        data: [],
        events: [],
    } as const;
}