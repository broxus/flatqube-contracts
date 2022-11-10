pragma ton-solidity >= 0.57.0;

library DirectOperationErrors {
    uint16 constant NOT_ACTIVE                                  = 101;
    uint16 constant INVALID_PAYLOAD                             = 102;
    uint16 constant VALUE_TOO_LOW                               = 103;
    uint16 constant NON_POSITIVE_LP_SUPPLY                      = 104;
    uint16 constant NOT_LP_TOKEN_WALLET                         = 105;
    uint16 constant NOT_TOKEN_WALLET                            = 106;
    uint16 constant NOT_TOKEN_ROOT                              = 107;
    uint16 constant WRONG_OPERATION_TYPE                        = 108;
    uint16 constant CAN_NOT_CALCULATE_RECEIVED_AMOUNT           = 109;
    uint16 constant RECEIVED_AMOUNT_IS_LESS_THAN_EXPECTED       = 110;
    uint16 constant INVALID_NEXT_STEPS                          = 111;
    uint16 constant WRONG_TOKEN_ROOT                            = 112;
    uint16 constant WRONG_PREVIOUS_POOL                         = 113;
}
