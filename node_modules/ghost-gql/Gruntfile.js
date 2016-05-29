module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        shell: {
            jison: {
                command: 'node_modules/jison/lib/cli.js src/gql.y src/gql.l --outfile dist/parser.js'
            }
        },
        // ### grunt-mocha-istanbul
        // Configuration for the mocha test coverage generator
        // `grunt coverage`.
        mocha_istanbul: {
            coverage: {
                src: ['test'],
                options: {
                    mask: '*_spec.js',
                    coverageFolder: 'test/coverage',
                    excludes: ['src']
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-mocha-istanbul');
    grunt.loadNpmTasks('grunt-shell');

    // Default task(s).
    grunt.registerTask('build', 'Generate parser from src files',
        ['shell:jison']
    );
    grunt.registerTask('coverage', 'Generate unit and integration (mocha) tests coverage report',
        ['build', 'mocha_istanbul:coverage']
    );
};