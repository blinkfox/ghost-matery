/**
 * # Knexify
 *
 * This is, at present, little more than a hack and needs revisiting.
 * The `buildWhere` function is able to correctly transform JSON from GQL into a knex querybuilder
 * How and where to do this needs to be considered.
 */

var _ = require('lodash'),
    resourceContext = require('./context'),

    // local functions
    processFilter,
    buildWhere,
    whereType;

_.mixin(require('./lodash-stmt'));

// @TODO: remove this function
processFilter = function processFilter(filter, context) {
    var joins = [],
        addJoin,
        expandAlias,
        processProperty;

    addJoin = function addJoin(join) {
        if (joins.indexOf(join) === -1) {
            joins.push(join);
        }
    };

    expandAlias = function expandAlias(property) {
        // Expand property aliases into their proper paths
        if (context.propAliases && context.propAliases[property]) {
            property = context.propAliases[property];
        }

        return property;
    };

    processProperty = function processProperty(property) {
        var parts;

        property = expandAlias(property);

        // Separate property by '.'
        parts = property.split('.');

        // If length is 1, we only have a column name, add table name
        if (parts.length === 1) {
            property = context.name ? context.name + '.' + property : property;
        }

        // Collect relations together into an array of 'include' properties
        // This is sort of a hack for building joins and include params later
        // It almost certainly doesn't belong here
        if (parts.length > 1) {
            addJoin(parts[0]);
            //if (context.relations && context.relations.indexOf(parts[parts.length - 1]) > -1) {
            //    addJoin(path);
            //}
        }

        return property;
    };

    // Loop through and process all the properties, really should be elsewhere
    _.eachStatement(filter.statements, function (statement) {
        statement.prop = processProperty(statement.prop);
    });

    filter.joins = joins;

    return filter;
};

/**
 * Detect Where Type
 * @param statement
 * @param index
 * @returns {string}
 */
whereType = function whereType(statement, index) {
    var whereFunc = 'andWhere';
    if (index === 0) {
        whereFunc = 'where';

    } else if (statement.func === 'or') {
        whereFunc = 'orWhere';
    }

    if (statement.value === null) {
        if (statement.func === 'or') {
            whereFunc = statement.op === 'IS NOT' ? 'orWhereNotNull' : 'orWhereNull';
        } else {
            whereFunc = statement.op === 'IS NOT' ? 'whereNotNull' : 'whereNull';
        }
    }

    return whereFunc;
};

/**
 * Build Where
 *
 * @param qb
 * @param statements
 * @returns {*}
 */
buildWhere = function buildWhere(qb, statements) {
    _.eachStatement(
        statements,
        function single(statement, index) {
            // @TODO - validate value vs id here, to ensure we only pass valid things into where
            qb[whereType(statement, index)](statement.prop, statement.op, statement.value);
        },
        function group(statement, index) {
            qb[whereType(statement, index)](function (_qb) {
                buildWhere(_qb, statement.group);
            });
        }
    );
};

/**
 * Knexify
 * Converts a 'filter' from a set of statements in JSON form, into a set of `where` calls on a queryBuilder object
  * This wrapping call to buildWhere should eventually be removed
 *
 * @param qb
 * @param filter
 * @returns {object} queryBuilder
 */
module.exports = function knexify(qb, filter) {
    filter = processFilter(filter, resourceContext[qb._single.table]);
    buildWhere(qb, filter.statements);
    // return modified queryBuilder object for chaining
    return qb;
};

// For testing only
module.exports._buildWhere = buildWhere;