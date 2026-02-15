/* src/storage.js - Persistent storage wrapper */
/* eslint-disable no-var */

var store = require('movian/store');
var safeStringify = require('./utils').safeStringify;

var db = store.create('watchhistory');

/**
 * Get value from storage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key not found
 * @returns {*} Stored value or default
 */
exports.get = function(key, defaultValue) {
    var val = db[key];
    if (val === undefined || val === null) {
        return defaultValue;
    }
    // Parse JSON if stored as string
    if (typeof val === 'string' && (val[0] === '[' || val[0] === '{')) {
        try {
            return JSON.parse(val);
        } catch (e) {
            return defaultValue;
        }
    }
    return val;
};

/**
 * Set value in storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
exports.set = function(key, value) {
    if (typeof value === 'object') {
        db[key] = safeStringify(value);
    } else {
        db[key] = value;
    }
};

// Limits
exports.MAX_HISTORY = 200;
exports.MAX_FAVORITES = 500;
