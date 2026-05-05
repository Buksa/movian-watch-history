/* src/global-observer.js - Global media observer for all streams (HLS, MP4, etc.) */
/* eslint-disable no-var */

/**
 * Unified playback tracking for all video types.
 *
 * Strategy:
 * 1. Track playback via prop.global.media.current.url
 * 2. On playback start (URL appears): get metadata from navObserver cache, record position=0
 * 3. On playback stop (URL becomes null): wait 150ms, read restartpos via bindPlayInfo
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

function recordHistory(data, position, duration, context) {
    try {
        history.record(data, position, duration);
        log.d('[global-observer] ' + context + ' OK');
    } catch (e) {
        log.e('[global-observer] ' + context + ' failed: ' + e);
    }
}

// Subscribe to metadata duration - when it arrives, title and icon are already ready
// This is more reliable as duration comes last in the initialization sequence
P.subscribe(P.global.media.current.metadata.duration, function(type, v1) {
    try {
        if (type !== 'set' || !currentSession) {
            return;
        }

        var newDuration = utils.safeNumber(v1, 0);
        if (newDuration <= 0) {
            return;
        }

        // Only accept delayed duration for the playback session that requested it.
        if (pendingDurationUrl !== currentSession.canonicalUrl) {
            return;
        }

        currentSession.duration = newDuration;

        if (globalMediaTitle && currentSession.title === 'Unknown') {
            currentSession.title = globalMediaTitle;
            log.d('[global-observer] Duration callback: updating title to "' + globalMediaTitle + '"');
        }

        if (globalMediaIcon) {
            currentSession.icon = globalMediaIcon;
        }

        pendingDurationUrl = null;

        log.d('[global-observer] Updating history: title="' + currentSession.title +
            '", duration=' + newDuration + 's');
        recordHistory({
            canonicalUrl: currentSession.canonicalUrl,
            url: currentSession.url,
            title: currentSession.title,
            icon: currentSession.icon,
            parentUrl: currentSession.parentUrl,
            source: 'global-observer'
        }, 0, newDuration, 'duration update');
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
    log.d('[global-observer] START url=' + url.substring(0, 60));

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

    log.d('[global-observer] Session: title="' + title +
        '" duration=' + duration + 's ' +
        (duration === 0 ? '(waiting for metadata)' : '(ready)'));

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
    recordHistory({
        canonicalUrl: canonicalUrl,
        url: url,
        title: title,
        icon: icon,
        parentUrl: parentUrl,
        source: 'global-observer'
    }, 0, duration, 'playback start record');
}

/**
 * Stop tracking playback, save final position
 */
function onPlaybackStop() {
    log.d('[global-observer] STOP');

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

            recordHistory({
                canonicalUrl: session.canonicalUrl,
                url: session.url,
                title: session.title,
                icon: session.icon,
                parentUrl: session.parentUrl,
                source: 'global-observer'
            }, position, duration, 'playback stop record');
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
