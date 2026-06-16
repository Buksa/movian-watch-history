/* src/global-observer.js - Global media observer for all streams (HLS, MP4, etc.) */
/* eslint-disable no-var */

/**
 * Unified playback tracking for all video types.
 *
 * Strategy:
 * 1. Track playback via prop.global.media.current.url
 * 2. On playback start (URL appears): get metadata from navObserver cache, record position=0
 * 3. On playback stop (URL becomes null): wait 150ms, read restartpos from kvstore via bindPlayInfo
 */

var P = require('movian/prop');
var metadata = require('native/metadata');
var history = require('./history');
var service = require('movian/service');
var log = require('./log');
var navObserver = require('./navigation-observer');
var utils = require('./utils');

// Global title from metadata (fallback when videoparams unavailable)
var globalMediaTitle = null;
var globalMediaIcon = null;

// Track URL pending duration update (to avoid race condition)
var pendingDurationUrl = null;

// Subscribe to metadata duration - when it arrives, title and icon are already ready
// This is more reliable as duration comes last in the initialization sequence
P.subscribe(P.global.media.current.metadata.duration, function(type, v1) {
    try {
        if (type === 'set' && v1 > 0 && currentSession && pendingDurationUrl === currentSession.canonicalUrl) {
            var newDuration = utils.safeNumber(v1, 0);

            // Use globalMediaTitle/Icon populated by their subscriptions
            var updatedTitle = currentSession.title;
            if (globalMediaTitle && currentSession.title === 'Unknown') {
                updatedTitle = globalMediaTitle;
                log.d('[global-observer] Duration callback: updating title to "' + globalMediaTitle + '"');
            }

            // Update session
            currentSession.duration = newDuration;
            currentSession.title = updatedTitle;
            if (globalMediaIcon) {
                currentSession.icon = globalMediaIcon;
            }

pendingDurationUrl = null;

            log.d('[global-observer] Updating history: title="' + updatedTitle + '", duration=' + newDuration + 's');
            history.record({
                canonicalUrl: currentSession.canonicalUrl,
                url: currentSession.url,
                title: updatedTitle,
                icon: currentSession.icon,
                parentUrl: currentSession.parentUrl,
                source: 'global-observer'
            }, 0, newDuration);
        }
    } catch (e) {
        log.e('[global-observer] Error in duration callback: ' + e);
    }
}, { autoDestroy: false });

// Subscribe to metadata title
P.subscribe(P.global.media.current.metadata.title, function(type, v1) {
    try {
        if (type === 'set' && v1) {
            globalMediaTitle = String(v1);
            if (globalMediaTitle === 'null' || globalMediaTitle === '') {
                globalMediaTitle = null;
                return;
            }
            log.d('[global-observer] Metadata title: ' + globalMediaTitle);

            if (currentSession && currentSession.title === 'Unknown') {
                currentSession.title = globalMediaTitle;
            }
        }
    } catch (e) {
        log.e('[global-observer] Error in title callback: ' + e);
    }
}, { autoDestroy: false });

// Subscribe to metadata icon
P.subscribe(P.global.media.current.metadata.icon, function(type, v1) {
    try {
        if (type === 'set' && v1) {
            globalMediaIcon = String(v1);
        }
    } catch (e) {
        log.e('[global-observer] Error in icon callback: ' + e);
    }
}, { autoDestroy: false });

// Session state
var currentSession = null;
var mainSubscription = null;

/**
 * Read restartpos from Movian kvstore using bindPlayInfo
 * @param {string} canonicalUrl - Canonical URL
 * @param {Function} callback - Called with position in seconds
 */
function readRestartPos(canonicalUrl, callback) {
    log.d('[global-observer] readRestartPos: ' + canonicalUrl.substring(0, 50));

    var tempProp;
    try {
        tempProp = P.createRoot();
    } catch (e) {
        log.d('[global-observer] ERROR creating tempProp: ' + e);
        callback(0);
        return;
    }

    try {
        metadata.bindPlayInfo(tempProp, canonicalUrl);
    } catch (e) {
        log.d('[global-observer] ERROR bindPlayInfo: ' + e);
        try { P.destroy(tempProp); } catch (ex) { }
        callback(0);
        return;
    }

    setTimeout(function () {
        try {
            P.subscribeValue(tempProp.restartpos, function (seconds) {
                var position = 0;
                if (seconds !== null && seconds !== undefined) {
                    position = Number(seconds);
                    if (isNaN(position)) position = 0;
                }

                log.d('[global-observer] restartpos=' + position + 's');

                try {
                    P.destroy(tempProp);
                } catch (e) { }

                callback(position);
            });
        } catch (e) {
            log.d('[global-observer] ERROR subscribing restartpos: ' + e);
            try { P.destroy(tempProp); } catch (ex) { }
            callback(0);
        }
    }, 50);
}

/**
 * Start tracking playback
 */
function onPlaybackStart(url) {
    if (!service.enabled) {
        return;
    }

    // Get metadata from cached videoparams (navigation-observer cached it)
    var videoParams = navObserver.getLastVideoParams('global-observer');
    var cachedDuration = navObserver.getLastCachedDuration('global-observer');

    // Use canonicalUrl from videoparams or fall back to URL
    var canonicalUrl = (videoParams && videoParams.canonicalUrl) ? videoParams.canonicalUrl : url;

    // Get initial duration (will be updated via title callback if needed)
    var duration = cachedDuration || utils.safeNumber(P.global.media.current.metadata.duration, 0);

    // Three-tier title fallback: videoparams -> global metadata -> filename extraction
    var title = 'Unknown';

    if (videoParams && videoParams.title) {
        title = videoParams.title;
    } else if (globalMediaTitle) {
        title = globalMediaTitle;
    } else if (url.indexOf('file://') === 0) {
        var filename = url.substring(url.lastIndexOf('/') + 1);
        try { filename = decodeURIComponent(filename); } catch (e) {}
        filename = filename.replace(/\.[^/.]+$/, "");
        filename = filename.replace(/_/g, ' ');
        title = filename;
    }

    // Check if duration needs update later
    if (duration === 0) {
        pendingDurationUrl = canonicalUrl;
    } else {
        pendingDurationUrl = null;
    }

    // Icon fallback
    var icon = (videoParams && videoParams.icon) ? videoParams.icon : globalMediaIcon;

    // Get navigation info
    var parentUrl = navObserver.getLastUrl();

    log.d('[global-observer] START: "' + title + '" url=' + url.substring(0, 60) + ' duration=' + duration + 's');

    // Store session
    currentSession = {
        canonicalUrl: canonicalUrl,
        url: url,
        title: title,
        icon: icon,
        parentUrl: parentUrl,
        startTime: Date.now(),
        duration: duration
    };

    // Record initial entry with position=0
    history.record({
        canonicalUrl: canonicalUrl,
        url: url,
        title: title,
        icon: icon,
        parentUrl: parentUrl,
        source: 'global-observer'
    }, 0, duration);
}

/**
 * Stop tracking playback, save final position
 */
function onPlaybackStop() {
    if (!currentSession) {
        return;
    }

    var session = currentSession;
    currentSession = null;

    // Clear global metadata and pending flags for next playback
    globalMediaTitle = null;
    globalMediaIcon = null;
    pendingDurationUrl = null;

    if (!service.enabled) {
        return;
    }

    log.d('[global-observer] STOP: "' + session.title + '" played=' + (Date.now() - session.startTime) + 'ms');

    // Wait 150ms for Movian to save restartpos
    setTimeout(function () {
        readRestartPos(session.canonicalUrl, function (restartPos) {
            var position = restartPos > 0 ? restartPos : 0;
            var duration = session.duration || utils.safeNumber(P.global.media.current.metadata.duration, 0);

            log.d('[global-observer] Final: ' + position + '/' + duration + 's');

            history.record({
                canonicalUrl: session.canonicalUrl,
                url: session.url,
                title: session.title,
                icon: session.icon,
                parentUrl: session.parentUrl,
                source: 'global-observer'
            }, position, duration);
        });
    }, 150);
}

/**
 * Initialize the global observer
 */
exports.init = function () {
    log.d('[global-observer] Initializing...');

    mainSubscription = P.subscribeValue(P.global.media.current.url, function (url) {
        var urlStr = url ? utils.safeString(url, '') : null;

        if (!urlStr) {
            onPlaybackStop();
        } else {
            onPlaybackStart(urlStr);
        }
    });

    log.d('[global-observer] Ready');
};
