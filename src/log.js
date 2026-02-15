/* src/log.js - Logger with Caller Location */
/* eslint-disable no-var */

var safeStringify = require('./utils').safeStringify;

var debugMode = false;

/**
 * Get caller location from stack trace for Duktape/ES5.1
 */
function getCallerLocation() {
    try {
        var stack = new Error().stack;
        if (typeof stack !== 'string') return '';

        var lines = stack.split('\n');
        // In Duktape:
        // 0: getCallerLocation
        // 1: logWithLevel (or similar)
        // 2: exports.d/e/p
        // 3: The actual caller
        if (lines.length > 3) {
            var line = lines[3].trim();
            var match = line.match(/\(([^)]+)\)/);

            if (match) {
                var location = match[1].replace(/^file:\/\//, '');
                var parts = location.split(':');

                if (parts.length >= 2) {
                    var filename = parts[0].split('/').pop();
                    return filename + ':' + parts[1] + ' - ';
                }
            }
        }
    } catch (e) {
        // Fail silently
    }
    return '';
}

function format(data) {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';
    if (typeof data === 'object') return safeStringify(data, 2);
    return String(data);
}

exports.setDebug = function(v) {
    debugMode = !!v;
};

exports.d = function(m) {
    if (debugMode) {
        console.log('[D] ' + getCallerLocation() + format(m));
    }
};

exports.e = function(m) {
    console.log('[E] ' + getCallerLocation() + format(m));
};

exports.i = function(m) {
    console.log('[I] ' + getCallerLocation() + format(m));
};

exports.p = function(m) {
    if (debugMode) {
        console.log('[P] ' + getCallerLocation() + format(m));
    }
};
