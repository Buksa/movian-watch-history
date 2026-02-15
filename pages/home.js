/* pages/home.js - Main page with sections */
/* eslint-disable no-var */

var history = require('../src/history');
var favorites = require('../src/favorites');
var getNavUrl = require('../src/utils').getNavUrl;

/**
 * Show main page
 * @param {Object} page - Movian page object
 */
exports.show = function (page) {
    page.type = 'directory';
    page.metadata.title = 'Watch History';
    page.loading = false;

    // Continue Watching section
    var continueList = history.getContinue(5);
    if (continueList.length > 0) {
        page.appendPassiveItem('separator', null, { title: 'Continue Watching' });

        for (var i = 0; i < continueList.length; i++) {
            var item = continueList[i];
            var title = item.title;
            if (item.progress > 0 && item.progress < 100) {
                title += ' (' + item.progress + '%)';
            }

            page.appendItem(getNavUrl(item), 'directory', {
                title: title,
                icon: item.icon
            });
        }

        if (history.getContinue().length > 5) {
            page.appendItem('watchhistory:continue', 'directory', {
                title: 'Show all...'
            });
        }
    }

    // Recent History section
    var historyList = history.list(5);
    if (historyList.length > 0) {
        page.appendPassiveItem('separator', null, { title: 'Recently Watched' });

        for (var j = 0; j < historyList.length; j++) {
            var hItem = historyList[j];
            page.appendItem(getNavUrl(hItem), 'directory', {
                title: hItem.title,
                icon: hItem.icon
            });
        }

        if (history.count() > 5) {
            page.appendItem('watchhistory:history', 'directory', {
                title: 'Show all history...'
            });
        }
    }

    // Favorites section
    var favList = favorites.list(5);
    if (favList.length > 0) {
        page.appendPassiveItem('separator', null, { title: 'Favorites' });

        for (var k = 0; k < favList.length; k++) {
            var fItem = favList[k];
            page.appendItem(getNavUrl(fItem), 'directory', {
                title: fItem.title,
                icon: fItem.icon
            });
        }

        if (favorites.count() > 5) {
            page.appendItem('watchhistory:favorites', 'directory', {
                title: 'Show all favorites...'
            });
        }
    }

    // Navigation
    page.appendPassiveItem('separator', null, { title: 'Browse' });

    page.appendItem('watchhistory:continue', 'directory', {
        title: 'Continue Watching (' + history.getContinue().length + ')'
    });

    page.appendItem('watchhistory:history', 'directory', {
        title: 'Full History (' + history.count() + ')'
    });

    page.appendItem('watchhistory:favorites', 'directory', {
        title: 'Favorites (' + favorites.count() + ')'
    });

    // Empty state
    if (continueList.length === 0 && historyList.length === 0 && favList.length === 0) {
        page.appendPassiveItem('label', null, {
            title: 'No watch history yet'
        });
        page.appendPassiveItem('label', null, {
            title: 'Start watching content from any plugin to build your history'
        });
    }
};
