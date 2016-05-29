/**
 * Context
 *
 * Temporary file that contains things that shouldn't be in this module
 */

// contextual information we need to do the next stage of processing
var resourceContext = {
    posts: {
        name: 'posts',
        propAliases: {author: 'author.slug', tags: 'tags.slug', tag: 'tags.slug'},
        relations: []
    },
    tags: {
        name: 'tags',
        propAliases: {},
        relations: []
    },
    users: {
        name: 'users',
        propAliases: {role: 'roles.name'},
        relations: []
    }
};

module.exports = resourceContext;