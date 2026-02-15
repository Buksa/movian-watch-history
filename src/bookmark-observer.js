/* src/bookmark-observer.js - Bookmark-based favorites via currentpage.bookmarked */
/* eslint-disable no-var */

var P = require('movian/prop');
var popup = require('movian/popup');
var favorites = require('./favorites');
var log = require('./log');
var safeString = require('./utils').safeString;

var currentPageUrl = null;
var currentPageTitle = null;
var currentPageIcon = null;
var lastBookmarked = null;

exports.init = function() {
    log.d('[bookmark-observer] Initializing...');

    // Track current page URL to distinguish page changes from bookmark toggles
    P.subscribeValue(
        P.global.navigators.current.currentpage.url,
        function(value) {
            var url = value ? safeString(value, null) : null;
            if (url !== currentPageUrl) {
                log.d('[bookmark-observer] Page changed: ' +
                    (url ? url.substring(0, 60) : 'null'));
                currentPageUrl = url;
                currentPageTitle = null;
                currentPageIcon = null;
                lastBookmarked = null; // Reset — next bookmarked event is initial state
            }
        }
    );

    // Cache page title via subscription (direct prop access returns proxy objects)
    P.subscribeValue(
        P.global.navigators.current.currentpage.model.metadata.title,
        function(value) {
            if (value) {
                currentPageTitle = String(value);
                if (currentPageTitle === 'null' || currentPageTitle === '') {
                    currentPageTitle = null;
                }
            } else {
                currentPageTitle = null;
            }
            log.d('[bookmark-observer] title cached: ' + (currentPageTitle || 'null'));
        }
    );

    // Cache page icon via subscription
    P.subscribeValue(
        P.global.navigators.current.currentpage.model.metadata.icon,
        function(value) {
            if (value) {
                currentPageIcon = String(value);
                if (currentPageIcon === 'null' || currentPageIcon === '') {
                    currentPageIcon = null;
                }
            } else {
                currentPageIcon = null;
            }
        }
    );

    // Subscribe to bookmark state changes
    P.subscribeValue(
        P.global.navigators.current.currentpage.bookmarked,
        function(value) {
            try {
                var bookmarked = Number(value) || 0;

                log.d('[bookmark-observer] bookmarked=' + bookmarked +
                    ', page=' + (currentPageUrl ? currentPageUrl.substring(0, 60) : 'null') +
                    ', prev=' + lastBookmarked);

                // Only act on explicit toggles (lastBookmarked !== null means we've seen initial state)
                if (lastBookmarked !== null && currentPageUrl) {
                    // Validate URL is not empty or null string
                    if (!currentPageUrl || currentPageUrl === 'null' || currentPageUrl === '') {
                        log.d('[bookmark-observer] Skipping - invalid URL');
                        return;
                    }

                    // Skip player pages (videoparams)
                    if (currentPageUrl.indexOf('videoparams:') === 0 ||
                        currentPageUrl.indexOf(':play:') !== -1 ||
                        currentPageUrl.indexOf(':play/') !== -1) {
                        log.d('[bookmark-observer] Skipping player page');
                        return;
                    }

                    if (bookmarked === 1 && lastBookmarked === 0) {
                        // User bookmarked this page
                        var title = currentPageTitle || 'Unknown';
                        var icon = currentPageIcon;

                        var added = favorites.add({
                            url: currentPageUrl,
                            title: title,
                            icon: icon
                        });
                        if (added) {
                            log.d('[bookmark-observer] Added: ' + title);
                            popup.notify('Added to favorites: ' + title, 2);
                        } else {
                            log.d('[bookmark-observer] Already exists: ' + title);
                        }
                    } else if (bookmarked === 0 && lastBookmarked === 1) {
                        // User un-bookmarked
                        var removed = favorites.remove(currentPageUrl);
                        if (removed) {
                            log.d('[bookmark-observer] Removed: ' + currentPageUrl.substring(0, 60));
                            popup.notify('Removed from favorites', 2);
                        }
                    }
                }

                lastBookmarked = bookmarked;
            } catch (e) {
                log.e('[bookmark-observer] Error in bookmark handler: ' + e);
            }
        }
    );

    log.d('[bookmark-observer] Initialized');
};
