/* pages/favorites.js - Favorites page */
/* eslint-disable no-var */

var favorites = require('../src/favorites');
var getNavUrl = require('../src/utils').getNavUrl;

/**
 * Show favorites page
 * @param {Object} page - Movian page object
 */
exports.show = function(page) {
    page.type = 'directory';
    page.metadata.title = 'Favorites';
    page.loading = false;

    var list = favorites.list();

    if (list.length === 0) {
        page.appendPassiveItem('label', null, {
            title: 'No favorites yet'
        });
        page.appendPassiveItem('label', null, {
            title: 'Use the item menu to add content to favorites'
        });
        return;
    }

    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        page.appendItem(getNavUrl(item), 'directory', {
            title: item.title,
            icon: item.icon
        });
    }

    // Add clear button
    if (list.length > 0) {
        page.appendPassiveItem('separator', null, { title: 'Actions' });
        page.appendAction('Clear all favorites', function() {
            favorites.clear();
            page.redirect('watchhistory:favorites');
        }, 'delete');
    }
};
