/* src/history.js - Watch history management */
/* eslint-disable no-var */

var storage = require('./storage');
var log = require('./log');

var STORAGE_KEY = 'history';

/**
 * Get history list
 * @returns {Array}
 */
function getList() {
    return storage.get(STORAGE_KEY, []);
}

/**
 * Save history list
 * @param {Array} list
 */
function saveList(list) {
    storage.set(STORAGE_KEY, list);
}

/**
 * Find index of entry in list by canonical URL
 * @param {Array} list - History list
 * @param {string} canonicalUrl - Canonical URL to find
 * @returns {number} Index or -1 if not found
 */
function findIndex(list, canonicalUrl) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].canonicalUrl === canonicalUrl) {
            return i;
        }
    }
    return -1;
}

/**
 * Record a watch event
 * @param {Object} data - Playback data from scrobbler
 * @param {number} position - Position in seconds
 * @param {number} duration - Duration in seconds
 */
exports.record = function(data, position, duration) {
    log.d('[history] record: ' + (data ? data.title : 'null') + ' pos=' + position + ' dur=' + duration);
    
    if (!data || !data.canonicalUrl) {
        log.d('[history] Skipped - no canonicalUrl');
        return;
    }
    
    var list = getList();

    // Remove old entry if exists
    var idx = findIndex(list, data.canonicalUrl);
    if (idx !== -1) {
        list.splice(idx, 1);
    }
    
    // Calculate progress
    var progress = 0;
    if (duration > 0) {
        progress = Math.round((position / duration) * 100);
        if (progress > 100) progress = 100;
    }
    
    var entry = {
        canonicalUrl: data.canonicalUrl,
        url: data.url || data.canonicalUrl || null,  // Fallback to canonicalUrl for navigation
        parentUrl: data.parentUrl || null,  // Details page URL for navigation
        title: data.title || 'Unknown',
        icon: data.icon || null,
        position: Math.round(position),
        duration: Math.round(duration),
        progress: progress,
        source: data.source || null,
        watchedAt: Date.now()
    };
    
    log.d('[history] New entry: ' + entry.title + ' progress=' + progress + '%');
    
    // Add to beginning
    list.unshift(entry);
    
    // Limit size
    if (list.length > storage.MAX_HISTORY) {
        list = list.slice(0, storage.MAX_HISTORY);
    }

    saveList(list);
};

/**
 * Get watch history
 * @param {number} [limit] - Max items to return
 * @returns {Array}
 */
exports.list = function(limit) {
    var list = getList();
    if (limit && limit > 0) {
        return list.slice(0, limit);
    }
    return list;
};

/**
 * Get "Continue Watching" list
 * Only entries with progress < 90% and position > 0
 * 
 * @param {number} [limit] - Max items to return
 * @returns {Array}
 */
exports.getContinue = function(limit) {
    var list = getList();
    var result = [];
    
    for (var i = 0; i < list.length; i++) {
        var h = list[i];
        // Not finished (< 90%) and has position
        if (h.position > 0 && h.progress < 90) {
            result.push(h);
            if (limit && result.length >= limit) break;
        }
    }
    
    return result;
};

/**
 * Get history count
 * @returns {number}
 */
exports.count = function() {
    return getList().length;
};

/**
 * Clear all history
 */
exports.clear = function() {
    saveList([]);
    log.d('[history] Cleared all history');
};
