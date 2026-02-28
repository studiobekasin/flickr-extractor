// Flickr Album URL Extractor - Popup Script

var currentData = {
    albums: [],
    images: [],
    albumResults: {},
    folderName: ''
};

var SIZE_FALLBACK = {
    '_k': ['k','h','b'],
    '_h': ['h','k','b'],
    '_b': ['b','h','k'],
    '_o': ['o','k','h','b']
};

function getSelectedSize() {
    return document.querySelector('input[name="imgSize"]:checked').value;
}

function pickBestUrl(photoSizes, preferredSize) {
    var chain = SIZE_FALLBACK[preferredSize] || ['k','h','b'];
    for (var i = 0; i < chain.length; i++) {
        if (photoSizes[chain[i]]) return photoSizes[chain[i]];
    }
    var keys = Object.keys(photoSizes);
    return keys.length > 0 ? photoSizes[keys[0]] : null;
}

// Tab switching
document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.add('hidden'); });
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
    });
});

function setStatus(msg, type) {
    var s = document.getElementById('status');
    s.textContent = msg;
    s.className = 'status ' + (type || '');
}

function showProgress(pct) {
    document.getElementById('progressBar').style.display = pct >= 0 ? 'block' : 'none';
    document.getElementById('progressFill').style.width = pct + '%';
}

function updateStats() {
    document.getElementById('albumCount').textContent = currentData.albums.length;
    var total = currentData.images.length;
    var keys = Object.keys(currentData.albumResults);
    for (var i = 0; i < keys.length; i++) {
        total += Object.keys(currentData.albumResults[keys[i]].photos).length;
    }
    document.getElementById('imageCount').textContent = total;
}

function updateSelectedCount() {
    var n = document.querySelectorAll('#albumList input[type="checkbox"]:checked').length;
    document.getElementById('selectedCount').textContent = n + ' selected';
}

function renderAlbums() {
    var list = document.getElementById('albumList');
    if (currentData.albums.length === 0) {
        list.innerHTML = '<div class="album-item"><span class="album-name">No albums found</span></div>';
        return;
    }
    var html = '';
    for (var i = 0; i < currentData.albums.length; i++) {
        var a = currentData.albums[i];
        var safe = (a.title || 'Untitled').replace(/"/g, '&quot;');
        html += '<div class="album-item">' +
            '<input type="checkbox" class="album-checkbox" data-id="' + a.id + '" data-url="' + a.url + '" data-title="' + safe + '">' +
            '<span class="album-name">' + (a.title || 'Untitled') +
            (a.photoCount ? ' <small style="color:#888">(' + a.photoCount + ')</small>' : '') +
            '</span>' +
            '<span class="album-status" id="album-status-' + a.id + '"></span></div>';
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
            var photoIds = Object.keys(album.photos);
            for (var j = 0; j < photoIds.length; j++) {
                var url = pickBestUrl(album.photos[photoIds[j]], size);
                if (url) text += url + '\n';
            }
            text += '\n';
        }
    }

    if (currentData.images.length > 0 && albumIds.length === 0) {
        if (currentData.folderName) text += currentData.folderName + '\n\n';
        for (var k = 0; k < currentData.images.length; k++) {
            var img = currentData.images[k];
            var u = pickBestUrl(img, size);
            if (u) text += u + '\n';
        }
    }

    if (!text) {
        output.value = '// No images extracted yet';
        return;
    }
    output.value = text.trim();
}

async function executeInTab(code, tabId) {
    try {
        if (!tabId) {
            var tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) return null;
            tabId = tabs[0].id;
        }
        var results = await browser.tabs.executeScript(tabId, { code: code });
        return results[0];
    } catch (e) {
        console.error('executeInTab error:', e);
        return null;
    }
}

// The core extraction code that runs inside a tab to get all photo URLs
// It reads both rendered HTML and escaped JSON in script tags
var EXTRACT_ALL_PHOTOS_CODE = `
(function() {
    var photos = {};

    function addUrl(url) {
        if (url.indexOf('//') === 0) url = 'https:' + url;
        if (url.indexOf('live.staticflickr.com') === -1) return;
        var m = url.match(/live\\.staticflickr\\.com\\/\\d+\\/(\\d+)_([a-f0-9]+)(?:_([a-z]))?\\.\\w+/);
        if (!m) return;
        var photoId = m[1];
        var size = m[3] || 'z';
        var dominated = {s:1, q:1, t:1, m:1, n:1, w:1};
        if (dominated[size]) return;
        if (!photos[photoId]) photos[photoId] = {};
        photos[photoId][size] = url;
    }

    // Get full page HTML, unescape JSON slashes, then find all staticflickr URLs
    var raw = document.documentElement.innerHTML;
    var unescaped = raw.replace(/\\\\\\//g, '/');
    var re = /(?:https?:)?\\/\\/live\\.staticflickr\\.com\\/\\d+\\/\\d+_[a-f0-9]+(?:_[a-z])?\\.\\w+/g;
    var match;
    while ((match = re.exec(unescaped)) !== null) {
        addUrl(match[0]);
    }

    return photos;
})();
`;

// Wait for a tab to finish loading
function waitForTabLoad(tabId) {
    return new Promise(function(resolve) {
        function check(changeTabId, changeInfo) {
            if (changeTabId === tabId && changeInfo.status === 'complete') {
                browser.tabs.onUpdated.removeListener(check);
                resolve();
            }
        }
        browser.tabs.onUpdated.addListener(check);
        // Also check immediately in case already loaded
        browser.tabs.get(tabId).then(function(tab) {
            if (tab.status === 'complete') {
                browser.tabs.onUpdated.removeListener(check);
                resolve();
            }
        });
    });
}

// Open album in background tab, extract photos, close tab
async function fetchAlbumViaTab(albumUrl) {
    var tab = null;
    try {
        tab = await browser.tabs.create({ url: albumUrl, active: false });
        await waitForTabLoad(tab.id);
        // Small delay for any dynamic content
        await new Promise(function(r) { setTimeout(r, 1500); });

        var photos = await executeInTab(EXTRACT_ALL_PHOTOS_CODE, tab.id);

        await browser.tabs.remove(tab.id);
        return photos || {};
    } catch (e) {
        console.error('fetchAlbumViaTab error:', e);
        if (tab) {
            try { await browser.tabs.remove(tab.id); } catch(e2) {}
        }
        return {};
    }
}

// Extract albums from the current albums list page
async function extractAlbums() {
    setStatus('Looking for albums...', 'loading');

    var code = `
    (function() {
        var albums = [];
        var seen = {};

        // Method 1: Links with title attr (Flickr's main pattern)
        var links = document.querySelectorAll('a[href*="/albums/"][title], a[href*="/sets/"][title]');
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var m = link.href.match(/\\/photos\\/[^\\/]+\\/(?:albums|sets)\\/(\\d+)/);
            if (!m || seen[m[1]]) continue;
            var title = link.getAttribute('title');
            if (!title || title === 'Albums') continue;
            seen[m[1]] = true;
            var countEl = link.querySelector('.album-photo-count');
            var photoCount = countEl ? countEl.textContent.trim() : '';
            albums.push({ id: m[1], title: title, url: link.href, photoCount: photoCount });
        }

        // Method 2: data-albumid divs
        if (albums.length === 0) {
            var divs = document.querySelectorAll('[data-albumid]');
            for (var k = 0; k < divs.length; k++) {
                var aid = divs[k].getAttribute('data-albumid');
                if (!aid || seen[aid]) continue;
                seen[aid] = true;
                var h4 = divs[k].querySelector('.album-title, h4');
                var t = h4 ? h4.textContent.trim() : 'Untitled';
                var countEl2 = divs[k].querySelector('.album-photo-count');
                var pc = countEl2 ? countEl2.textContent.trim() : '';
                var user = window.location.pathname.split('/')[2] || '';
                albums.push({ id: aid, title: t, url: 'https://www.flickr.com/photos/' + user + '/albums/' + aid, photoCount: pc });
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

// Bulk fetch selected albums via background tabs
async function fetchSelectedAlbums() {
    var checkboxes = document.querySelectorAll('#albumList .album-checkbox:checked');
    if (checkboxes.length === 0) {
        setStatus('No albums selected.', 'error');
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
        setStatus('Opening album ' + (i + 1) + '/' + selected.length + ': ' + album.title + '...', 'loading');

        var statusEl = document.getElementById('album-status-' + album.id);
        if (statusEl) { statusEl.textContent = 'loading...'; statusEl.className = 'album-status fetching'; }

        var photos = await fetchAlbumViaTab(album.url);
        var count = Object.keys(photos).length;

        currentData.albumResults[album.id] = { title: album.title, photos: photos };

        if (statusEl) { statusEl.textContent = count + ' photos'; statusEl.className = 'album-status done'; }
        updateStats();
    }

    showProgress(100);
    var totalPhotos = 0;
    Object.keys(currentData.albumResults).forEach(function(id) {
        totalPhotos += Object.keys(currentData.albumResults[id].photos).length;
    });
    setStatus('Done! ' + totalPhotos + ' photos from ' + selected.length + ' albums.', 'success');
    document.getElementById('fetchSelectedBtn').disabled = false;
    updateOutput();

    setTimeout(function() { document.querySelector('.tab[data-tab="output"]').click(); }, 500);
}

// Extract from current page (single album or photostream)
async function extractImages() {
    setStatus('Extracting images...', 'loading');

    var folderName = await executeInTab(`
    (function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var p = document.title.split('|');
        return p.length > 1 ? p[0].trim() : document.title.trim();
    })();
    `);
    if (folderName) currentData.folderName = folderName;

    var photos = await executeInTab(EXTRACT_ALL_PHOTOS_CODE);

    if (photos && Object.keys(photos).length > 0) {
        // Convert to array of size maps
        currentData.images = [];
        var ids = Object.keys(photos);
        for (var i = 0; i < ids.length; i++) {
            currentData.images.push(photos[ids[i]]);
        }
        setStatus('Found ' + ids.length + ' photos!', 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found. Try "Load All" or open an album.', 'error');
    }
}

// Load all by scrolling, then extract
async function loadAllImages() {
    setStatus('Scrolling to load all images...', 'loading');
    document.getElementById('loadAllBtn').disabled = true;

    var folderName = await executeInTab(`
    (function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var p = document.title.split('|');
        return p.length > 1 ? p[0].trim() : document.title.trim();
    })();
    `);
    if (folderName) currentData.folderName = folderName;

    // Scroll first
    await executeInTab(`
    new Promise(function(resolve) {
        var count = 0, noChange = 0, lastH = 0, max = 30;
        var iv = setInterval(function() {
            window.scrollTo(0, document.body.scrollHeight);
            count++;
            if (document.body.scrollHeight === lastH) noChange++; else { noChange = 0; lastH = document.body.scrollHeight; }
            if (noChange >= 3 || count >= max) { clearInterval(iv); window.scrollTo(0, 0); resolve(true); }
        }, 1200);
    });
    `);

    // Then extract
    var photos = await executeInTab(EXTRACT_ALL_PHOTOS_CODE);
    document.getElementById('loadAllBtn').disabled = false;

    if (photos && Object.keys(photos).length > 0) {
        currentData.images = [];
        var ids = Object.keys(photos);
        for (var i = 0; i < ids.length; i++) {
            currentData.images.push(photos[ids[i]]);
        }
        setStatus('Loaded ' + ids.length + ' photos!', 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found after scrolling.', 'error');
    }
}

// Copy
document.getElementById('copyBtn').addEventListener('click', function() {
    document.getElementById('outputArea').select();
    document.execCommand('copy');
    setStatus('Copied to clipboard!', 'success');
});

// Download
document.getElementById('downloadBtn').addEventListener('click', function() {
    var text = document.getElementById('outputArea').value;
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'flickr-urls-' + Date.now() + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded!', 'success');
});

// Size change rerenders output
document.querySelectorAll('input[name="imgSize"]').forEach(function(r) {
    r.addEventListener('change', updateOutput);
});

// Button handlers
document.getElementById('fetchSelectedBtn').addEventListener('click', fetchSelectedAlbums);
document.getElementById('extractBtn').addEventListener('click', extractImages);
document.getElementById('loadAllBtn').addEventListener('click', loadAllImages);
document.getElementById('extractAlbumsBtn').addEventListener('click', extractAlbums);

// Init
async function init() {
    try {
        var tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs || !tabs[0]) { setStatus('No active tab.', 'error'); return; }
        var url = tabs[0].url || '';

        if (url.indexOf('flickr.com') === -1) {
            setStatus('Not a Flickr page.', 'error');
            document.getElementById('extractBtn').disabled = true;
            document.getElementById('loadAllBtn').disabled = true;
            document.getElementById('fetchSelectedBtn').disabled = true;
            return;
        }

        var isSingleAlbum = url.match(/\/(albums|sets)\/\d+/);
        if (isSingleAlbum) {
            setStatus('Single album detected.', 'success');
            extractImages();
        } else if (url.indexOf('/albums') !== -1 || url.indexOf('/sets') !== -1) {
            setStatus('Albums list detected.', 'success');
            extractAlbums();
        } else {
            setStatus('Flickr page detected.', 'success');
            extractImages();
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

init();
