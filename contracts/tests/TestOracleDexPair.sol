pragma ton-solidity >= 0.57.1;

import "../DexPair.sol";

contract TestOracleDexPair is DexPair {
    /// @dev Only for test purposes. Comment it before release!
    /// @param _newPoints Encoded points map
    /// @param _newLength Size of the map
    /// @return bool Whether or not _points was updated
    function setPoints(
        TvmCell _newPoints,
        uint16 _newLength
    ) external responsible returns (bool) {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Check input params
        require(_newLength <= _cardinality, 1234);

        // Update _points and _length
        _length = _newLength;
        _points = _newPoints
            .toSlice()
            .decode(mapping(uint32 => Point));

        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.ALL_NOT_RESERVED
        } true;
    }
}
