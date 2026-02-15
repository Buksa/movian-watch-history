/* pages/history.js - Full watch history page */
/* eslint-disable no-var */

var history = require('../src/history');
var getNavUrl = require('../src/utils').getNavUrl;

/**
 * Show full history page
 * @param {Object} page - Movian page object
 */
exports.show = function(page) {
    page.type = 'directory';
    page.metadata.title = 'Watch History';
    page.loading = false;

    var list = history.list();

    if (list.length === 0) {
        page.appendPassiveItem('label', null, {
            title: 'No watch history'
        });
        page.appendPassiveItem('label', null, {
            title: 'Start watching content from any plugin to build your history'
        });
        return;
    }

    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var title = item.title;

        // Add progress indicator
        if (item.progress >= 100) {
            title += ' (watched)';
        } else if (item.progress > 0) {
            title += ' (' + item.progress + '%)';
        }

        page.appendItem(getNavUrl(item), 'directory', {
            title: title,
            icon: item.icon
        });
    }

    // Add clear button
    if (list.length > 0) {
        page.appendPassiveItem('separator', null, { title: 'Actions' });
        page.appendAction('Clear all history', function() {
            history.clear();
            //redirect to home after clearing to avoid showing cached data from history page
            page.redirect('page:home');
        }, 'delete');
    }
};
