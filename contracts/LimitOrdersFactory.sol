pragma ton-solidity >= 0.57.0;

pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

import "./libraries/LimitOrdersGas.sol";
import "./libraries/LimitOrdersErrors.sol";

import "LimitOrdersRoot.sol"; 

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

contract LimitOrdersFactory {
    
    uint32 static randomNonce_;    

    address owner;
    address pendingOwner;

    TvmCell limitOrdersRootCode;
    TvmCell limitOrderCode;

    constructor(address _owner) public {
        require(_owner.value != 0);

        tvm.accept();
        owner = _owner;

        tvm.rawReserve(LimitOrdersGas.TARGET_BALANCE, 0);
        owner.transfer({ value: 0, bounce: false, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS });
    }

    modifier onlyOwner() {
        require(msg.sender.value != 0 && msg.sender == owner, LimitOrdersErrors.NOT_OWNER);
        _;
    }

    function getOwner() external view responsible returns (address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } owner;
    }

    function getPendingOwner() external view responsible returns (address) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } pendingOwner;
    }

    function limitOrdersRoot() external view responsible returns (TvmCell) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } limitOrdersRootCode;
    }

    function limitOrder() external view responsible returns (TvmCell) {
        return { value: 0, bounce: false, flag: MsgFlag.REMAINING_GAS } limitOrderCode;
    }

    function transferOwner(address newOwner) external responsible onlyOwner returns (address) {
        pendingOwner = newOwner;
        return { value: 0, bounce: false, flag:  MsgFlag.REMAINING_GAS } pendingOwner;
    }

    function acceptOwner() external responsible returns (address) {
        require(msg.sender.value != 0 && msg.sender == pendingOwner, LimitOrdersErrors.NOT_PENDING_OWNER);
        owner = pendingOwner;
        pendingOwner = address(0);

        return { value: 0, bounce: false, flag:  MsgFlag.REMAINING_GAS } owner;
    }

    function setlimitOrdersRootCode(TvmCell _limitOrdersRootCode) public onlyOwner {
        limitOrdersRootCode = _limitOrdersRootCode;
        msg.sender.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
    }

    function setlimitOrderCode(TvmCell _limitOrderCode) public onlyOwner {
        limitOrderCode = _limitOrderCode;
        msg.sender.transfer(0, false, MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS);
    }

    function createLimitOrdersRoot(address tokenRoot) external {
        tvm.rawReserve(LimitOrdersGas.DEPLOY_PAIR_MIN_VALUE, 0);
        TvmCell indexCode = buildCode(owner, tokenRoot, limitOrdersRootCode);
        TvmCell stateInit_ = buildState(indexCode, tokenRoot);

        new LimitOrdersRoot{
            stateInit: stateInit_,
            value: LimitOrdersGas.DEPLOY_PAIR_MIN_VALUE
        }(msg.sender);
    }

    function buildCode(
        address _owner, 
        address tokenRoot,
        TvmCell _limitOrdersRootCode
    ) internal pure returns (TvmCell) {
        TvmBuilder salt;
        salt.store(_owner, tokenRoot);
        return tvm.setCodeSalt(_limitOrdersRootCode, salt.toCell());
    }

    function buildState(
        TvmCell code_, 
        address tokenRoot_
    ) internal view returns (TvmCell) {
        return tvm.buildStateInit({
            contr: LimitOrdersRoot,
            varInit: {
                ownerLimit: owner,
                tokenRoot: tokenRoot_,
                limitOrderCode: limitOrderCode
            },
            code: code_
        });
    }
}