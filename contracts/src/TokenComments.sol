// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ITokenFactory {
    function tokenIndexPlusOne(address token) external view returns (uint256);
}

/// @title  TokenComments
/// @notice Lightweight on-chain comments for tokens launched via TokenFactory.
/// @dev    Comments are restricted to launched tokens only and rate-limited per author.
///         Storage is unbounded by design (cheap on L2); UIs are expected to paginate.
contract TokenComments {
    uint256 public constant COMMENT_COOLDOWN = 30;     // seconds between posts per author
    uint256 public constant MAX_TEXT_LEN     = 280;
    uint256 public constant MAX_PAGE         = 100;

    ITokenFactory public immutable factory;

    struct Comment {
        address author;
        address token;
        uint64  createdAt;
        string  text;
    }

    Comment[] private _comments;
    mapping(address => uint256[]) private _byToken;
    mapping(address => uint64)    public lastCommentAt;        // unix seconds

    event CommentPosted(
        address indexed token,
        address indexed author,
        uint256 indexed commentId,
        string  text,
        uint256 createdAt
    );

    error UnknownToken();
    error CooldownActive();
    error EmptyText();
    error TextTooLong();
    error PageTooLarge();
    error ZeroAddress();

    constructor(address _factory) {
        if (_factory == address(0)) revert ZeroAddress();
        factory = ITokenFactory(_factory);
    }

    function postComment(address token, string calldata text) external returns (uint256 commentId) {
        if (factory.tokenIndexPlusOne(token) == 0) revert UnknownToken();

        uint64 last = lastCommentAt[msg.sender];
        if (last != 0 && block.timestamp < uint256(last) + COMMENT_COOLDOWN) revert CooldownActive();

        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_TEXT_LEN) revert TextTooLong();

        lastCommentAt[msg.sender] = uint64(block.timestamp);
        commentId = _comments.length;
        _comments.push(Comment({
            author:    msg.sender,
            token:     token,
            createdAt: uint64(block.timestamp),
            text:      text
        }));
        _byToken[token].push(commentId);

        emit CommentPosted(token, msg.sender, commentId, text, block.timestamp);
    }

    function commentsCount() external view returns (uint256) {
        return _comments.length;
    }

    function getComment(uint256 commentId) external view returns (Comment memory) {
        return _comments[commentId];
    }

    function tokenCommentsCount(address token) external view returns (uint256) {
        return _byToken[token].length;
    }

    function getComments(address token, uint256 offset, uint256 limit)
        external
        view
        returns (Comment[] memory out)
    {
        if (limit > MAX_PAGE) revert PageTooLarge();
        uint256[] storage ids = _byToken[token];
        if (offset >= ids.length) return new Comment[](0);
        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;
        out = new Comment[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            out[i - offset] = _comments[ids[i]];
        }
    }
}
