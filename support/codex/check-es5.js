'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var acorn = require('./vendor/acorn');

function trackedJavaScript() {
    var output = childProcess.execFileSync(
        'git',
        ['ls-files', '-z', '--', '*.js'],
        { encoding: 'utf8' }
    );

    return output.split('\0').filter(function(value) {
        return value !== '';
    });
}

function stagedSource(filename) {
    return childProcess.execFileSync(
        'git',
        ['show', ':' + filename],
        { encoding: 'utf8' }
    );
}

function checkFile(filename, source) {
    try {
        acorn.parse(source, {
            ecmaVersion: 5,
            sourceFile: path.normalize(filename),
            sourceType: 'script'
        });
        return 0;
    } catch (error) {
        var line = error.loc ? error.loc.line : 1;
        var column = error.loc ? error.loc.column + 1 : 1;
        console.error(
            'ERROR: ' + filename + ':' + line + ':' + column + ': ' +
            error.message
        );
        return 1;
    }
}

function main() {
    var filenames = process.argv.slice(2);
    var staged = filenames.length === 0;
    var failures = 0;
    var index;
    var source;

    if (staged) {
        filenames = trackedJavaScript();
    }

    for (index = 0; index < filenames.length; index += 1) {
        source = staged ?
            stagedSource(filenames[index]) :
            fs.readFileSync(filenames[index], 'utf8');
        failures += checkFile(filenames[index], source);
    }

    if (failures !== 0) {
        return 1;
    }

    console.log(
        (staged ? 'Staged' : 'Selected') +
        ' JavaScript parses as ECMAScript 5'
    );
    return 0;
}

process.exitCode = main();
