/* src/navigation-observer.js - Track navigation stack for history */
/* eslint-disable no-var */

var prop = require('movian/prop');
var log = require('./log');

var MAX_STACK_SIZE = 15;
var navigationStack = [];

// Cache for videoparams metadata and duration (cleared after use)
var lastVideoParams = null;
var lastCachedDuration = 0;

/**
 * Check if URL is a player page (should not be in stack)
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isPlayerPage(url) {
    if (!url) return false;
    return url.indexOf('videoparams:') === 0 ||
        url.indexOf(':play:') !== -1 ||
        url.indexOf(':play/') !== -1;
}

/**
 * Parse videoparams URL
 * @param {string} url - videoparams URL
 * @returns {Object|null}
 */
function parseVideoParams(url) {
    if (url.indexOf('videoparams:') !== 0) return null;
    try {
        return JSON.parse(url.substring(12));
    } catch (e) {
        return null;
    }
}

/**
 * Initialize navigation observer
 */
function init() {
    log.d('[nav-observer] Initializing...');

    try {
        // Subscribe to currentpage changes to track navigation and cache metadata
        prop.subscribeValue(
            prop.global.navigators.current.currentpage.url,
            function (value) {
                if (!value) return;
                var url = String(value);

                // Get source if available (priority for metadata)
                var sourceUrl = null;
                try {
                    var source = prop.global.navigators.current.currentpage.source;
                    if (source) {
                        sourceUrl = String(source);
                    }
                } catch (e) { }

                // Try to parse videoparams from source (priority) or url
                var videoParams = parseVideoParams(sourceUrl) || parseVideoParams(url);
                if (videoParams) {
                    lastVideoParams = videoParams;
                    lastCachedDuration = videoParams.duration || 0;
                    log.d('[nav-observer] Cached: ' +
                        (videoParams.title ? videoParams.title.substring(0, 40) : 'no title') +
                        (lastCachedDuration > 0 ? ' duration=' + lastCachedDuration + 's' : ''));
                }

                // Home page: clear stack and caches
                if (url === 'page:home') {
                    clear('home-page');
                    return;
                }

                // Skip player pages (videoparams or other players)
                if (isPlayerPage(url)) {
                    return;
                }

                // Avoid duplicates
                if (navigationStack.length > 0 &&
                    navigationStack[navigationStack.length - 1] === url) {
                    return;
                }

                navigationStack.push(url);

                // Limit size
                if (navigationStack.length > MAX_STACK_SIZE) {
                    navigationStack.shift();
                }
            }
        );
        log.d('[nav-observer] Initialized');
    } catch (e) {
        log.d('[nav-observer] Failed to init: ' + e);
    }
}

/**
 * Get last non-player URL (parent page)
 * @returns {string|null}
 */
function getLastUrl() {
    if (navigationStack.length === 0) return null;
    return navigationStack[navigationStack.length - 1];
}

/**
 * Get cached videoparams metadata (NOT cleared - stays until new video params cached)
 * @param {string} [caller] - Who is requesting (for debug)
 * @returns {Object|null}
 */
function getLastVideoParams(caller) {
    var result = lastVideoParams;
    log.d('[nav-observer] videoparams for [' + (caller || '?') + ']: ' +
        (result ? (result.title ? result.title.substring(0, 40) : 'no title') : 'null'));
    return result;
}

/**
 * Get cached duration from videoparams (NOT cleared - stays until new video params cached)
 * @param {string} [caller] - Who is requesting (for debug)
 * @returns {number}
 */
function getLastCachedDuration(caller) {
    return lastCachedDuration;
}

/**
 * Clear navigation stack
 */
function clear(reason) {
    log.d('[nav-observer] CLEAR: stack=' + navigationStack.length +
        ', cache=' + (lastVideoParams ? lastVideoParams.title : 'null') +
        ', reason=' + (reason || 'unknown'));
    navigationStack = [];
    lastVideoParams = null;
    lastCachedDuration = 0;
}

exports.init = init;
exports.getLastUrl = getLastUrl;
exports.getLastVideoParams = getLastVideoParams;
exports.getLastCachedDuration = getLastCachedDuration;
