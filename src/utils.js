/* src/utils.js - Shared utility functions */
/* eslint-disable no-var */

/**
 * Safely stringify an object, handling Movian Prop objects and circular refs
 * @param {*} obj - Object to stringify
 * @param {number} [indent] - JSON indent spaces
 * @returns {string}
 */
function safeStringify(obj, indent) {
    try {
        var seen = [];
        return JSON.stringify(obj, function(key, val) {
            if (val != null && typeof val === 'object') {
                if (val.valueOf && String(val.valueOf()).indexOf('[prop') === 0) {
                    return String(val);
                }
                if (seen.indexOf(val) !== -1) {
                    return '[Circular]';
                }
                seen.push(val);
            }
            return val;
        }, indent);
    } catch (e) {
        return '[Unserializable: ' + e.message + ']';
    }
}

/**
 * Safely extract a string from a value (handles Movian Prop proxies)
 * @param {*} val - Value to convert
 * @param {*} [fallback] - Fallback if null/undefined
 * @returns {string|null}
 */
function safeString(val, fallback) {
    if (val === null || val === undefined) {
        return fallback !== undefined ? fallback : null;
    }
    if (typeof val === 'object' && typeof val.valueOf === 'function') {
        var v = val.valueOf();
        return v !== null && v !== undefined ? String(v) : (fallback !== undefined ? fallback : null);
    }
    return String(val);
}

/**
 * Safely extract a number from a value (handles Movian Prop proxies)
 * @param {*} val - Value to convert
 * @param {*} [fallback] - Fallback if null/undefined/NaN
 * @returns {number}
 */
function safeNumber(val, fallback) {
    if (val === null || val === undefined) {
        return fallback !== undefined ? fallback : 0;
    }
    if (typeof val === 'object' && typeof val.valueOf === 'function') {
        val = val.valueOf();
    }
    var num = Number(val);
    return isNaN(num) ? (fallback !== undefined ? fallback : 0) : num;
}

/**
 * Get navigation URL for a history/favorite item
 * Prefers parentUrl (details page), falls back to canonicalUrl/url
 * @param {Object} item - History or favorite entry
 * @returns {string}
 */
function getNavUrl(item) {
    return item.parentUrl || item.canonicalUrl || item.url || '';
}

exports.safeStringify = safeStringify;
exports.safeString = safeString;
exports.safeNumber = safeNumber;
exports.getNavUrl = getNavUrl;
