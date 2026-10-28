// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  FortuneSeal
/// @notice Daily fortune commitments for Chain Omen (链签) on X Layer.
///
///         The fortune is derived from the day's seed, the wallet and the day index:
///
///             fortune = keccak256(abi.encodePacked(daySeed, wallet, day))
///
///         so anyone can recompute it. Sealing does not change the fortune — it only
///         proves that this exact reading existed at this time.
contract FortuneSeal {
    struct Seal {
        bytes32 fortune;
        uint64 sealedAt;
    }

    address public owner;
    uint256 public fee = 0.0001 ether; // OKB
    uint256 public accrued;

    mapping(uint256 day => bytes32) public daySeed;
    mapping(uint256 day => bool) public dayOpen;
    mapping(address wallet => mapping(uint256 day => Seal)) public seals;

    event DayOpened(uint256 indexed day, bytes32 seed);
    event Sealed(address indexed wallet, uint256 indexed day, bytes32 fortune, uint64 at);
    event FeeChanged(uint256 fee);
    event Withdrawn(address indexed to, uint256 amount);

    error AlreadyOpen();
    error NotOpen();
    error WrongFee();
    error AlreadySealed();
    error NotOwner();
    error SendFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Day index with a UTC+8 boundary — matches the frontend.
    function currentDay() public view returns (uint256) {
        return (block.timestamp + 8 hours) / 1 days;
    }

    /// @notice Open today's fortune and pin its seed. Callable once per day by anyone.
    ///         The seed is the parent block hash, so it is unknown when the day begins.
    function openDay() external {
        uint256 day = currentDay();
        if (dayOpen[day]) revert AlreadyOpen();
        dayOpen[day] = true;
        daySeed[day] = blockhash(block.number - 1);
        emit DayOpened(day, daySeed[day]);
    }

    /// @notice Same derivation as the frontend.
    function fortuneOf(address wallet, uint256 day) public view returns (bytes32) {
        if (!dayOpen[day]) revert NotOpen();
        return keccak256(abi.encodePacked(daySeed[day], wallet, day));
    }

    /// @notice Seal today's fortune for msg.sender. One seal per wallet per day.
    function seal() external payable {
        uint256 day = currentDay();
        if (!dayOpen[day]) revert NotOpen();
        if (msg.value != fee) revert WrongFee();
        if (seals[msg.sender][day].sealedAt != 0) revert AlreadySealed();

        bytes32 fortune = fortuneOf(msg.sender, day);
        seals[msg.sender][day] = Seal(fortune, uint64(block.timestamp));
        accrued += msg.value;

        emit Sealed(msg.sender, day, fortune, uint64(block.timestamp));
    }

    function setFee(uint256 newFee) external onlyOwner {
        fee = newFee;
        emit FeeChanged(newFee);
    }

    function withdraw(address payable to) external onlyOwner {
        uint256 amount = accrued;
        accrued = 0;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert SendFailed();
        emit Withdrawn(to, amount);
    }
}
