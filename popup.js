// Flickr Album URL Extractor - Popup Script

let currentData = {
    albums: [],
    images: [],
    albumResults: {},
    pageType: 'unknown',
    folderName: ''
};

function getSelectedSize() {
    return document.querySelector('input[name="imgSize"]:checked').value;
}

function convertToSize(url, size) {
    return url
        .replace(/_[smtqnbhkco]\.jpg/i, size + '.jpg')
        .replace(/_[smtqnbhkco]\.png/i, size + '.png');
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
    });
});

function setStatus(message, type) {
    var s = document.getElementById('status');
    s.textContent = message;
    s.className = 'status ' + (type || '');
}

function showProgress(pct) {
    var bar = document.getElementById('progressBar');
    var fill = document.getElementById('progressFill');
    bar.style.display = pct >= 0 ? 'block' : 'none';
    fill.style.width = pct + '%';
}

function updateStats() {
    document.getElementById('albumCount').textContent = currentData.albums.length;
    var total = currentData.images.length;
    var keys = Object.keys(currentData.albumResults);
    for (var i = 0; i < keys.length; i++) {
        total += currentData.albumResults[keys[i]].images.length;
    }
    document.getElementById('imageCount').textContent = total;
}

function updateSelectedCount() {
    var checked = document.querySelectorAll('#albumList input[type="checkbox"]:checked').length;
    document.getElementById('selectedCount').textContent = checked + ' selected';
}

function renderAlbums() {
    var list = document.getElementById('albumList');
    if (currentData.albums.length === 0) {
        list.innerHTML = '<div class="album-item"><span class="album-name">No albums found on this page</span></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < currentData.albums.length; i++) {
        var a = currentData.albums[i];
        var safeTitle = (a.title || 'Untitled').replace(/"/g, '&quot;');
        html += '<div class="album-item" data-index="' + i + '">' +
            '<input type="checkbox" class="album-checkbox" data-id="' + a.id + '" data-url="' + a.url + '" data-title="' + safeTitle + '">' +
            '<span class="album-name">' + (a.title || 'Untitled') + '</span>' +
            '<span class="album-photo-count-display">' + (a.photoCount || '') + '</span>' +
            '<span class="album-status" id="album-status-' + a.id + '"></span>' +
            '</div>';
    }
    list.innerHTML = html;

    list.querySelectorAll('.album-checkbox').forEach(function(cb) {
        cb.addEventListener('change', updateSelectedCount);
    });
    updateSelectedCount();
}

document.getElementById('selectAllBtn').addEventListener('click', function() {
    document.querySelectorAll('#albumList .album-checkbox').forEach(function(cb) { cb.checked = true; });
    updateSelectedCount();
});
document.getElementById('deselectAllBtn').addEventListener('click', function() {
    document.querySelectorAll('#albumList .album-checkbox').forEach(function(cb) { cb.checked = false; });
    updateSelectedCount();
});

function updateOutput() {
    var size = getSelectedSize();
    var output = document.getElementById('outputArea');
    var text = '';

    var albumIds = Object.keys(currentData.albumResults);
    if (albumIds.length > 0) {
        for (var i = 0; i < albumIds.length; i++) {
            var album = currentData.albumResults[albumIds[i]];
            text += album.title + '\n\n';
            for (var j = 0; j < album.images.length; j++) {
                text += convertToSize(album.images[j], size) + '\n';
            }
            text += '\n';
        }
    }

    if (currentData.images.length > 0 && albumIds.length === 0) {
        if (currentData.folderName) {
            text += currentData.folderName + '\n\n';
        }
        for (var k = 0; k < currentData.images.length; k++) {
            var img = currentData.images[k];
            text += convertToSize(img.large || img.thumbnail, size) + '\n';
        }
    }

    if (!text) {
        output.value = '// No images extracted yet\n// Use "Fetch URLs from Selected Albums" or "Extract Current Page Images"';
        return;
    }
    output.value = text.trim();
}

async function executeInTab(code) {
    try {
        var tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return null;
        var results = await browser.tabs.executeScript(tabs[0].id, { code: code });
        return results[0];
    } catch (e) {
        console.error('executeInTab error:', e);
        return null;
    }
}

// Extract albums from albums list page
async function extractAlbums() {
    setStatus('Looking for albums...', 'loading');

    var code = `
    (function() {
        var albums = [];
        var seen = {};

        // Method 1: photo-list-album links with title attribute
        var links = document.querySelectorAll('a.photo-list-album[href*="/albums/"], a.photo-list-album[href*="/sets/"]');
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var m = link.href.match(/\\/photos\\/[^\\/]+\\/(?:albums|sets)\\/(\\d+)/);
            if (m && !seen[m[1]]) {
                seen[m[1]] = true;
                var title = link.getAttribute('title') || '';
                if (!title) {
                    var h4 = link.querySelector('.album-title, h4');
                    if (h4) title = h4.textContent.trim();
                }
                var countEl = link.querySelector('.album-photo-count');
                var photoCount = countEl ? countEl.textContent.trim() : '';
                albums.push({ id: m[1], title: title || 'Untitled', url: link.href, photoCount: photoCount });
            }
        }

        // Method 2: any link to /albums/ or /sets/ (broader)
        if (albums.length === 0) {
            var allLinks = document.querySelectorAll('a[href*="/albums/"], a[href*="/sets/"]');
            for (var j = 0; j < allLinks.length; j++) {
                var link2 = allLinks[j];
                var m2 = link2.href.match(/\\/photos\\/[^\\/]+\\/(?:albums|sets)\\/(\\d+)/);
                if (m2 && !seen[m2[1]]) {
                    seen[m2[1]] = true;
                    var title2 = link2.getAttribute('title') || '';
                    if (!title2) {
                        var h4b = link2.querySelector('.album-title, h4');
                        if (h4b) title2 = h4b.textContent.trim();
                    }
                    if (!title2 && link2.textContent.trim().length < 60) {
                        title2 = link2.textContent.trim().split('\\n')[0].trim();
                    }
                    if (title2 && title2 !== 'Albums') {
                        albums.push({ id: m2[1], title: title2 || 'Untitled', url: link2.href, photoCount: '' });
                    }
                }
            }
        }

        // Method 3: data-albumid attributes
        if (albums.length === 0) {
            var divs = document.querySelectorAll('[data-albumid]');
            for (var k = 0; k < divs.length; k++) {
                var div = divs[k];
                var aid = div.getAttribute('data-albumid');
                if (aid && !seen[aid]) {
                    seen[aid] = true;
                    var h4c = div.querySelector('.album-title, h4');
                    var t = h4c ? h4c.textContent.trim() : 'Untitled';
                    var user = window.location.pathname.split('/')[2] || '';
                    albums.push({ id: aid, title: t, url: 'https://www.flickr.com/photos/' + user + '/albums/' + aid, photoCount: '' });
                }
            }
        }

        return albums;
    })();
    `;

    var result = await executeInTab(code);

    if (result && result.length > 0) {
        currentData.albums = result;
        setStatus('Found ' + result.length + ' albums', 'success');
        renderAlbums();
        updateStats();
    } else {
        setStatus('No albums found. Make sure you are on a Flickr albums page.', 'error');
    }
}

// Fetch images from a single album by fetching its HTML pages
async function fetchAlbumImages(albumUrl) {
    var code = `
    (async function() {
        var albumUrl = ${JSON.stringify(albumUrl)};
        var allUrls = {};
        var page = 1;
        var hasMore = true;

        while (hasMore && page <= 50) {
            try {
                var pageUrl = albumUrl.replace(/\\/?$/, '') + (page > 1 ? '/page' + page : '');
                var resp = await fetch(pageUrl, { credentials: 'include' });
                var html = await resp.text();

                var re = /https:\\/\\/live\\.staticflickr\\.com\\/\\d+\\/[^\\s"'<>]+\\.(?:jpg|png)/gi;
                var match;
                var foundNew = false;
                while ((match = re.exec(html)) !== null) {
                    var url = match[0]
                        .replace(/_[smtqnhkco]\\.jpg/i, '_b.jpg')
                        .replace(/_[smtqnhkco]\\.png/i, '_b.png');
                    if (!allUrls[url]) {
                        allUrls[url] = true;
                        foundNew = true;
                    }
                }

                // Check for next page link
                if (!foundNew || html.indexOf('/page' + (page + 1)) === -1) {
                    hasMore = false;
                }
                page++;
            } catch (e) {
                hasMore = false;
            }
        }
        return Object.keys(allUrls);
    })();
    `;

    var result = await executeInTab(code);
    return result || [];
}

// Bulk fetch selected albums
async function fetchSelectedAlbums() {
    var checkboxes = document.querySelectorAll('#albumList .album-checkbox:checked');
    if (checkboxes.length === 0) {
        setStatus('No albums selected. Check some albums first.', 'error');
        return;
    }

    var selected = [];
    checkboxes.forEach(function(cb) {
        selected.push({ id: cb.dataset.id, url: cb.dataset.url, title: cb.dataset.title });
    });

    document.getElementById('fetchSelectedBtn').disabled = true;
    currentData.albumResults = {};
    showProgress(0);

    for (var i = 0; i < selected.length; i++) {
        var album = selected[i];
        var pct = Math.round((i / selected.length) * 100);
        showProgress(pct);
        setStatus('Fetching album ' + (i + 1) + '/' + selected.length + ': ' + album.title + '...', 'loading');

        var statusEl = document.getElementById('album-status-' + album.id);
        if (statusEl) {
            statusEl.textContent = 'fetching...';
            statusEl.className = 'album-status fetching';
        }

        var images = await fetchAlbumImages(album.url);

        currentData.albumResults[album.id] = { title: album.title, images: images };

        if (statusEl) {
            statusEl.textContent = images.length + ' imgs';
            statusEl.className = 'album-status done';
        }
        updateStats();
    }

    showProgress(100);
    var totalImages = 0;
    var keys = Object.keys(currentData.albumResults);
    for (var j = 0; j < keys.length; j++) {
        totalImages += currentData.albumResults[keys[j]].images.length;
    }
    setStatus('Done! Fetched ' + totalImages + ' images from ' + selected.length + ' albums.', 'success');
    document.getElementById('fetchSelectedBtn').disabled = false;
    updateOutput();

    setTimeout(function() {
        document.querySelector('.tab[data-tab="output"]').click();
    }, 500);
}

// Extract images from current page
async function extractImages() {
    setStatus('Extracting images...', 'loading');

    var folderCode = `
    (function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var parts = document.title.split('|');
        if (parts.length > 1) return parts[0].trim();
        return document.title.trim();
    })();
    `;
    var folderName = await executeInTab(folderCode);
    if (folderName) currentData.folderName = folderName;

    var code = `
    (function() {
        var images = [];
        var seen = {};

        var imgs = document.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            if (img.src && img.src.indexOf('staticflickr') !== -1 && !seen[img.src]) {
                seen[img.src] = true;
                var large = img.src
                    .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\\.png/i, '_b.png');
                images.push({ thumbnail: img.src, large: large, alt: img.alt || '' });
            }
        }

        var bgEls = document.querySelectorAll('[style*="background"]');
        for (var j = 0; j < bgEls.length; j++) {
            var el = bgEls[j];
            var style = el.getAttribute('style') || '';
            var m = style.match(/url\\(['\"]?(https?:\\/\\/[^'\")\\s]+)['\"]?\\)/);
            if (m && m[1].indexOf('staticflickr') !== -1 && !seen[m[1]]) {
                seen[m[1]] = true;
                var large2 = m[1]
                    .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\\.png/i, '_b.png');
                images.push({ thumbnail: m[1], large: large2, alt: '' });
            }
        }

        return images;
    })();
    `;

    var result = await executeInTab(code);

    if (result && result.length > 0) {
        currentData.images = result;
        setStatus('Found ' + result.length + ' images!', 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found. Try scrolling or opening an album.', 'error');
    }
}

// Load all by scrolling
async function loadAllImages() {
    setStatus('Loading all images (scrolling page)...', 'loading');
    document.getElementById('loadAllBtn').disabled = true;

    var folderCode = `
    (function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var parts = document.title.split('|');
        if (parts.length > 1) return parts[0].trim();
        return document.title.trim();
    })();
    `;
    var folderName = await executeInTab(folderCode);
    if (folderName) currentData.folderName = folderName;

    var code = `
    new Promise(function(resolve) {
        var scrollCount = 0;
        var lastCount = 0;
        var noChangeCount = 0;
        var maxScrolls = 30;

        function extractCurrent() {
            var images = [];
            var seen = {};
            var imgs = document.querySelectorAll('img');
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].src && imgs[i].src.indexOf('staticflickr') !== -1 && !seen[imgs[i].src]) {
                    seen[imgs[i].src] = true;
                    var large = imgs[i].src.replace(/_[smtqn]\\.jpg/i, '_b.jpg').replace(/_[smtqn]\\.png/i, '_b.png');
                    images.push({ thumbnail: imgs[i].src, large: large, alt: imgs[i].alt || '' });
                }
            }
            var bgEls = document.querySelectorAll('[style*="background"]');
            for (var j = 0; j < bgEls.length; j++) {
                var style = bgEls[j].getAttribute('style') || '';
                var m = style.match(/url\\(['\"]?(https?:\\/\\/[^'\")\\s]+)['\"]?\\)/);
                if (m && m[1].indexOf('staticflickr') !== -1 && !seen[m[1]]) {
                    seen[m[1]] = true;
                    var large2 = m[1].replace(/_[smtqn]\\.jpg/i, '_b.jpg').replace(/_[smtqn]\\.png/i, '_b.png');
                    images.push({ thumbnail: m[1], large: large2, alt: '' });
                }
            }
            return images;
        }

        var interval = setInterval(function() {
            window.scrollTo(0, document.body.scrollHeight);
            scrollCount++;
            var current = extractCurrent();
            if (current.length === lastCount) { noChangeCount++; } else { noChangeCount = 0; lastCount = current.length; }
            if (noChangeCount >= 3 || scrollCount >= maxScrolls) {
                clearInterval(interval);
                window.scrollTo(0, 0);
                resolve(current);
            }
        }, 1200);
    });
    `;

    var result = await executeInTab(code);
    document.getElementById('loadAllBtn').disabled = false;

    if (result && result.length > 0) {
        currentData.images = result;
        setStatus('Loaded ' + result.length + ' images!', 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found after scrolling.', 'error');
    }
}

// Copy
document.getElementById('copyBtn').addEventListener('click', function() {
    var output = document.getElementById('outputArea');
    output.select();
    document.execCommand('copy');
    setStatus('Copied to clipboard!', 'success');
});

// Download
document.getElementById('downloadBtn').addEventListener('click', function() {
    var output = document.getElementById('outputArea').value;
    var blob = new Blob([output], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'flickr-urls-' + Date.now() + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded!', 'success');
});

// Size change
document.querySelectorAll('input[name="imgSize"]').forEach(function(r) {
    r.addEventListener('change', updateOutput);
});

// Buttons
document.getElementById('fetchSelectedBtn').addEventListener('click', fetchSelectedAlbums);
document.getElementById('extractBtn').addEventListener('click', extractImages);
document.getElementById('loadAllBtn').addEventListener('click', loadAllImages);
document.getElementById('extractAlbumsBtn').addEventListener('click', extractAlbums);

// Init
async function init() {
    try {
        var tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs[0]) {
            setStatus('Could not access active tab.', 'error');
            return;
        }
        var url = tabs[0].url || '';

        if (url.indexOf('flickr.com') === -1) {
            setStatus('Not a Flickr page. Navigate to flickr.com', 'error');
            document.getElementById('extractBtn').disabled = true;
            document.getElementById('loadAllBtn').disabled = true;
            document.getElementById('fetchSelectedBtn').disabled = true;
            return;
        }

        if (url.indexOf('/albums') !== -1 || url.indexOf('/sets') !== -1) {
            // Check if this is the albums LIST page (not a single album)
            var isSingleAlbum = url.match(/\/(albums|sets)\/\d+/);
            if (isSingleAlbum) {
                setStatus('Single album detected. Ready to extract.', 'success');
                extractImages();
            } else {
                setStatus('Albums list page detected.', 'success');
                extractAlbums();
            }
        } else {
            setStatus('Flickr page detected. Ready to extract.', 'success');
            extractImages();
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
        console.error('Init error:', e);
    }
}

init();
