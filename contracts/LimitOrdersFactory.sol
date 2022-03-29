pragma ton-solidity >=0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrdersGas.sol";
import "./libraries/LimitOrdersErrors.sol";
import "./interfaces/ILimitOrderFactory.sol";

import "./LimitOrdersRoot.sol";
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

contract LimitOrdersFactory is ILimitOrderFactory {
    uint32 static randomNonce_;

    address owner;
    address pendingOwner;

    TvmCell limitOrdersRootCode_;
    TvmCell limitOrderCode_;

    constructor(address _owner) public {
        require(_owner.value != 0);

        tvm.accept();
        owner = _owner;

        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        owner.transfer({
            value: 0,
            bounce: false,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    modifier onlyOwner() {
        require(
            msg.sender.value != 0 && msg.sender == owner,
            LimitOrdersErrors.NOT_OWNER
        );
        _;
    }

    function getOwner() external view responsible returns (address) {
        return owner;
    }

    function getPendingOwner() external view responsible returns (address) {
        return pendingOwner;
    }

    function limitOrdersRoot() external view responsible returns (TvmCell) {
        return limitOrdersRootCode_;
    }

    function limitOrder() external view responsible returns (TvmCell) {
        return limitOrderCode_;
    }

    function transferOwner(address newOwner)
        external
        responsible
        onlyOwner
        returns (address)
    {
        pendingOwner = newOwner;
        emit RequestedOwnerTransfer(owner, pendingOwner);

        return pendingOwner;
    }

    function acceptOwner() external responsible returns (address) {
        require(
            msg.sender.value != 0 && msg.sender == pendingOwner,
            LimitOrdersErrors.NOT_PENDING_OWNER
        );
        emit OwnerTransferAccepted(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);

        return owner;
    }

    function setlimitOrdersRootCode(TvmCell _limitOrdersRootCode)
        public
        onlyOwner
    {
        tvm.rawReserve(LimitOrdersGas.SET_CODE, 0);
        limitOrdersRootCode_ = _limitOrdersRootCode;

        emit LimitOrderRootCodeUpgraded();

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }

    function setlimitOrderCode(TvmCell _limitOrderCode) public onlyOwner {
        tvm.rawReserve(LimitOrdersGas.SET_CODE, 0);
        limitOrderCode_ = _limitOrderCode;

        emit LimitOrderCodeUpgraded();

        msg.sender.transfer(
            0,
            false,
            MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        );
    }
    
    function createLimitOrdersRoot(address tokenRoot) external {
        require(
            msg.value >= LimitOrdersGas.DEPLOY_ORDERS_ROOT,
            LimitOrdersErrors.VALUE_TOO_LOW
        );
        tvm.rawReserve(LimitOrdersGas.DEPLOY_ORDERS_ROOT, 0);

        TvmCell indexCode = buildCode(owner, tokenRoot, limitOrdersRootCode_);
        TvmCell stateInit_ = buildState(indexCode, tokenRoot);

        new LimitOrdersRoot{
            stateInit: stateInit_,
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(address(this), msg.sender);
    }

    function expectedAddressLimitOrderRoots(address tokenRoot_)
        internal
        view
        returns (address)
    {
        return
            address(
                tvm.hash(
                    buildState(
                        buildCode(owner, tokenRoot_, limitOrdersRootCode_),
                        tokenRoot_
                    )
                )
            );
    }

    function onLimitOrderRootDeployed(
        address limitOrderRoot,
        address tokenRoot,
        address sendGasTo
    ) external override {
        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        emit CreateLimitOrderRoot(limitOrderRoot, tokenRoot);
        sendGasTo.transfer({
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS
        });
    }

    function buildCode(
        address _owner,
        address _tokenRoot,
        TvmCell _limitOrdersRootCode
    ) internal pure returns (TvmCell){
        TvmBuilder salt;
        salt.store(_owner, _tokenRoot);
        return tvm.setCodeSalt(_limitOrdersRootCode, salt.toCell());
    }

    function buildState(
        TvmCell code_,
        address tokenRoot_
    ) internal view returns (TvmCell){
        return tvm.buildStateInit({
                contr: LimitOrdersRoot,
                varInit: {
                    tokenRoot_: tokenRoot_,
                    limitOrderCode: limitOrderCode_},
                code: code_
                });
    }
}
