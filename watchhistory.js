/* watchhistory.js - Global Watch History Plugin for Movian */
/* eslint-disable no-var */

var service = require('movian/service');
var settings = require('movian/settings');
var page = require('movian/page');
var log = require('./src/log');
var storage = require('./src/storage');

// Plugin info
var PLUGIN_ID = 'watch-history';
var PLUGIN_TITLE = 'Watch History';

log.d('[watchhistory] Plugin initializing...');

// Initialize service
service.create(PLUGIN_TITLE, 'watchhistory:start', 'video', true, Plugin.path + 'watchhistory.svg');

// Initialize settings
settings.globalSettings(PLUGIN_ID, PLUGIN_TITLE, null,
    'Global watch history and favorites for all plugins');

settings.createBool('debug', 'Debug Mode', false, function (v) {
    service.debug = v;
    log.setDebug(v);
    log.d('[watchhistory] Debug mode: ' + v);
});

settings.createBool('enabled', 'Enable watch history tracking', true, function (v) {
    service.enabled = v;
    log.d('[watchhistory] Tracking enabled: ' + v);
});

settings.createInt('historyLimit', 'Maximum history entries', 200, 50, 1000, 50, '', function (v) {
    storage.MAX_HISTORY = v;
    log.d('[watchhistory] History limit: ' + v);
});

settings.createInt('favoritesLimit', 'Maximum favorites', 500, 100, 2000, 100, '', function (v) {
    storage.MAX_FAVORITES = v;
    log.d('[watchhistory] Favorites limit: ' + v);
});

// Initialize navigation observer (tracks page navigation for parentUrl)
require('./src/navigation-observer').init();

// Initialize global observer (unified tracking for all stream types: HLS, MP4, etc.)
require('./src/global-observer').init();

// Initialize bookmark observer (favorites via Movian's bookmark star)
require('./src/bookmark-observer').init();

// Routes
new page.Route('watchhistory:start', function (p) {
    require('./pages/home').show(p);
});

new page.Route('watchhistory:continue', function (p) {
    require('./pages/continue').show(p);
});

new page.Route('watchhistory:history', function (p) {
    require('./pages/history').show(p);
});

new page.Route('watchhistory:favorites', function (p) {
    require('./pages/favorites').show(p);
});

log.d('[watchhistory] Plugin initialized');
