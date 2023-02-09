pragma ton-solidity >= 0.62.0;

/// @title Fee Params Interface
/// @notice Structure for packed pair's fee params
interface IFeeParams {
    /// @dev Structure for packed fee params
    struct FeeParams {
        /// @dev Denominator for pool and beneficiary fees numerators
        uint128 denominator;

        /// @dev Numerator for pool's fees
        uint128 pool_numerator;

        /// @dev Numerator for beneficiary's fees
        uint128 beneficiary_numerator;

        /// @dev Numerator for referrer's fees
        uint128 referrer_numerator;

        /// @dev Receiver of accumulated beneficiary fees
        address beneficiary;

        /// @dev Minimum withdraw amounts for token fees
        mapping(address => uint128) threshold;

        /// @dev Minimum withdraw amounts for referrer fees
        mapping(address => uint128) referrer_threshold;
    }
}
