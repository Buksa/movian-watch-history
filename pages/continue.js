/* pages/continue.js - Continue watching page */
/* eslint-disable no-var */

var history = require('../src/history');
var getNavUrl = require('../src/utils').getNavUrl;

/**
 * Show continue watching page
 * @param {Object} page - Movian page object
 */
exports.show = function (page) {
    page.type = 'directory';
    page.metadata.title = 'Continue Watching';
    page.loading = false;

    var list = history.getContinue();

    if (list.length === 0) {
        page.appendPassiveItem('label', null, {
            title: 'No unfinished content'
        });
        page.appendPassiveItem('label', null, {
            title: 'Content you start watching will appear here'
        });
        return;
    }

    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var title = item.title;

        // Add progress
        if (item.progress > 0 && item.progress < 100) {
            title += ' (' + item.progress + '%)';
        }

        // Add time info
        if (item.position > 0 && item.duration > 0) {
            var remaining = Math.round((item.duration - item.position) / 60);
            if (remaining > 0) {
                title += ' - ' + remaining + ' min left';
            }
        }

        page.appendItem(getNavUrl(item), 'directory', {
            title: title,
            icon: item.icon
        });
    }
};
