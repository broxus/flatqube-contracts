pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "../libraries/DexPlatformTypes.sol";

import "../DexPlatform.sol";

abstract contract DexContractBase  {
    TvmCell public platform_code;

    modifier onlyPlatform(
        uint8 _typeId,
        TvmCell _params
    ) {
        address expected = address(
            tvm.hash(
                _buildInitData(
                    _typeId,
                    _params
                )
            )
        );

        require(msg.sender == expected, DexErrors.NOT_PLATFORM);
        _;
    }

    modifier onlyAccount(address _accountOwner) {
        require(msg.sender == _expectedAccountAddress(_accountOwner), DexErrors.NOT_ACCOUNT);
        _;
    }

    modifier onlyPair(address[] _roots) {
        require(msg.sender == _expectedPairAddress(_roots), DexErrors.NOT_PAIR);
        _;
    }

    function _dexRoot() virtual internal view returns (address);

    function _expectedAccountAddress(address _accountOwner) internal view returns (address) {
        return address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Account,
                    _buildAccountParams(_accountOwner)
                )
            )
        );
    }

    function _expectedPairAddress(address[] _roots) internal view returns (address) {
        return address(
            tvm.hash(
                _buildInitData(
                    DexPlatformTypes.Pool,
                    _buildPairParams(_roots)
                )
            )
        );
    }

    function _buildAccountParams(address _accountOwner) internal pure returns (TvmCell) {
        TvmBuilder builder;

        builder.store(_accountOwner);

        return builder.toCell();
    }

    function _buildPairParams(address[] _roots) internal pure returns (TvmCell) {
        mapping(address => uint8) sorted;

        for (address root : _roots) {
            sorted[root] = 0;
        }

        if (_roots.length < 3) {
            TvmBuilder builder;

            for ((address key,) : sorted) {
                builder.store(key);
            }

            return builder.toCell();
        } else {
            return abi.encode(sorted);
        }
    }

    function _buildInitData(
        uint8 _typeId,
        TvmCell _params
    ) internal view returns (TvmCell) {
        return tvm.buildStateInit({
            contr: DexPlatform,
            varInit: {
                root: _dexRoot(),
                type_id: _typeId,
                params: _params
            },
            pubkey: 0,
            code: platform_code
        });
    }
}
