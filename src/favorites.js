/* src/favorites.js - Favorites management */
/* eslint-disable no-var */

var storage = require('./storage');

var STORAGE_KEY = 'favorites';

/**
 * Get favorites list
 * @returns {Array}
 */
function getList() {
    return storage.get(STORAGE_KEY, []);
}

/**
 * Save favorites list
 * @param {Array} list
 */
function saveList(list) {
    storage.set(STORAGE_KEY, list);
}

/**
 * Find index by URL
 * @param {Array} list - Favorites list
 * @param {string} url - Item URL
 * @returns {number} Index or -1
 */
function findIndex(list, url) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].url === url) {
            return i;
        }
    }
    return -1;
}

/**
 * Add item to favorites
 * @param {Object} item - {url, title, icon, source?}
 * @returns {boolean} true if added, false if already exists
 */
exports.add = function(item) {
    if (!item || !item.url) {
        return false;
    }
    
    var list = getList();
    
    // Check for duplicate
    if (findIndex(list, item.url) !== -1) {
        return false; // Already exists
    }
    
    // Add to beginning
    list.unshift({
        url: item.url,
        title: item.title || 'Unknown',
        icon: item.icon || null,
        source: item.source || null,
        addedAt: Date.now()
    });
    
    // Limit size
    if (list.length > storage.MAX_FAVORITES) {
        list = list.slice(0, storage.MAX_FAVORITES);
    }
    
    saveList(list);
    return true;
};

/**
 * Remove item from favorites
 * @param {string} url - Item URL
 * @returns {boolean} true if removed
 */
exports.remove = function(url) {
    var list = getList();
    var idx = findIndex(list, url);
    if (idx !== -1) {
        list.splice(idx, 1);
        saveList(list);
        return true;
    }
    return false;
};

/**
 * Check if item is in favorites
 * @param {string} url - Item URL
 * @returns {boolean}
 */
exports.has = function(url) {
    var list = getList();
    return findIndex(list, url) !== -1;
};

/**
 * Get all favorites
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
 * Get favorites count
 * @returns {number}
 */
exports.count = function() {
    return getList().length;
};

/**
 * Clear all favorites
 */
exports.clear = function() {
    saveList([]);
};

