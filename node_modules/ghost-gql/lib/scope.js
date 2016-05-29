var scope = {};

scope.resolveOp = function(op, value) {
    if (value === null) {
        return op === '!=' ? 'IS NOT' : 'IS';
    }
    return op;
};

scope.unescape = function(value) {
    var re = new RegExp('\\\\([\'"])', 'g');
    return value.replace(re, '$1');
};


module.exports = scope;