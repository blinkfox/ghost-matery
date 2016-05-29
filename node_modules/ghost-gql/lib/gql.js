var parser = require('../dist/parser').parser;
parser.yy = require("./scope");

var lex = exports.lex = function (input) {
    parser.lexer.setInput(input);
    var lexed = parser.lexer.lex(),
        tokens = [];

    while (lexed !== parser.lexer.EOF) {
        tokens.push({token: parser.terminals_[lexed], matched: parser.lexer.match});
        lexed = parser.lexer.lex();
    }

    return tokens;
};

// returns the JSON object
var parse = exports.parse = function (input, resource_type, aliases) {
    return parser.parse(input, resource_type, aliases);
};

exports.knexify = require('./knexify');
exports.json    = require('./lodash-stmt');
