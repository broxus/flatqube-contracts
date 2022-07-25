pragma ton-solidity >= 0.57.0;

/// @title Exchange Fee Interface
/// @notice Packed info about fees
interface IExchangeFee {
    /// @dev Packed info about fees during exchange
    struct ExchangeFee {
        /// @dev TokenRoot address of the fees' token
        address feeTokenRoot;

        /// @dev Collected amount of pool's fees after exchange
        uint128 pool_fee;

        /// @dev Collected amount of beneficiary's fees after exchange
        uint128 beneficiary_fee;

        /// @dev Receiver of accumulated beneficiary fees
        address beneficiary;
    }
}
