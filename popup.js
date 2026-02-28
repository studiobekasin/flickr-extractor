// Flickr Album URL Extractor - Popup Script

let currentData = {
    albums: [],
    images: [],
    albumResults: {}, // { albumId: { title, images[] } }
    pageType: 'unknown',
    folderName: ''
};

// Get selected image size suffix
function getSelectedSize() {
    return document.querySelector('input[name="imgSize"]:checked').value;
}

// Convert any staticflickr URL to the selected size
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
        document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
});

// Status & progress
function setStatus(message, type = '') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

function showProgress(percent) {
    const bar = document.getElementById('progressBar');
    const fill = document.getElementById('progressFill');
    bar.style.display = percent >= 0 ? 'block' : 'none';
    fill.style.width = percent + '%';
}

function updateStats() {
    document.getElementById('albumCount').textContent = currentData.albums.length;
    // Count total images from all sources
    let total = currentData.images.length;
    Object.values(currentData.albumResults).forEach(a => total += a.images.length);
    document.getElementById('imageCount').textContent = total;
}

function updateSelectedCount() {
    const checked = document.querySelectorAll('#albumList input[type="checkbox"]:checked').length;
    document.getElementById('selectedCount').textContent = checked + ' selected';
}

// Render albums with checkboxes
function renderAlbums() {
    const list = document.getElementById('albumList');

    if (currentData.albums.length === 0) {
        list.innerHTML = '<div class="album-item"><span class="album-name">No albums found on this page</span></div>';
        return;
    }

    list.innerHTML = currentData.albums.map((album, index) => `
        <div class="album-item" data-index="${index}">
            <input type="checkbox" class="album-checkbox" data-id="${album.id}" data-url="${album.url}" data-title="${(album.title || 'Untitled').replace(/"/g, '&quot;')}">
            <span class="album-name">${album.title || 'Untitled'}</span>
            <span class="album-status" id="album-status-${album.id}"></span>
        </div>
    `).join('');

    // Update selected count on change
    list.querySelectorAll('.album-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });

    updateSelectedCount();
}

// Select all / deselect all
document.getElementById('selectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('#albumList .album-checkbox').forEach(cb => cb.checked = true);
    updateSelectedCount();
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('#albumList .album-checkbox').forEach(cb => cb.checked = false);
    updateSelectedCount();
});

// Update output textarea
function updateOutput() {
    const size = getSelectedSize();
    const output = document.getElementById('outputArea');

    let text = '';

    // If we have bulk album results, show grouped by album
    const albumIds = Object.keys(currentData.albumResults);
    if (albumIds.length > 0) {
        albumIds.forEach(id => {
            const album = currentData.albumResults[id];
            text += album.title + '\n\n';
            album.images.forEach(url => {
                text += convertToSize(url, size) + '\n';
            });
            text += '\n';
        });
    }

    // If we have current page images (single album / extract)
    if (currentData.images.length > 0 && albumIds.length === 0) {
        if (currentData.folderName) {
            text += currentData.folderName + '\n\n';
        }
        currentData.images.forEach(img => {
            const url = convertToSize(img.large || img.thumbnail, size);
            text += url + '\n';
        });
    }

    if (!text) {
        output.value = '// No images extracted yet\n// Use "Fetch URLs from Selected Albums" or "Extract Current Page Images"';
        return;
    }

    output.value = text.trim();
}

// Execute script in active tab
async function executeInTab(func) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        try {
            const results = await browser.tabs.executeScript(tabs[0].id, {
                code: `(${func.toString()})()`
            });
            return results[0];
        } catch (e) {
            console.error('Execute error:', e);
            return null;
        }
    }
    return null;
}

// Fetch a single album's images by loading its pages in the content script context
async function fetchAlbumImages(albumUrl) {
    const images = await executeInTab(function() {
        const albumUrl = ALBUM_URL_PLACEHOLDER;

        return (async function() {
            const allUrls = new Set();
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 50) {
                try {
                    const pageUrl = page === 1 ? albumUrl : albumUrl.replace(/\/?$/, '') + '/page' + page;
                    const resp = await fetch(pageUrl, { credentials: 'include' });
                    const html = await resp.text();

                    // Extract all staticflickr URLs from HTML
                    const matches = html.matchAll(/https:\/\/live\.staticflickr\.com\/\d+\/[^\s"'<>]+\.(?:jpg|png)/gi);
                    let foundNew = false;
                    for (const m of matches) {
                        let url = m[0];
                        // Normalize to _b for storage, will convert later
                        url = url
                            .replace(/_[smtqnhkco]\.jpg/i, '_b.jpg')
                            .replace(/_[smtqnhkco]\.png/i, '_b.png');
                        if (!allUrls.has(url)) {
                            allUrls.add(url);
                            foundNew = true;
                        }
                    }

                    // Also check for photo data in modelExport JSON
                    const modelMatch = html.match(/modelExport:\s*(\{[\s\S]*?\})\s*,\s*auth/);
                    if (modelMatch) {
                        try {
                            // Try to extract photo URLs from the model data
                            const photoMatches = html.matchAll(/"url":"(https:\\\/\\\/live\.staticflickr\.com[^"]+)"/g);
                            for (const pm of photoMatches) {
                                let url = pm[1].replace(/\\\//g, '/');
                                url = url
                                    .replace(/_[smtqnhkco]\.jpg/i, '_b.jpg')
                                    .replace(/_[smtqnhkco]\.png/i, '_b.png');
                                if (!allUrls.has(url)) {
                                    allUrls.add(url);
                                    foundNew = true;
                                }
                            }
                        } catch(e) {}
                    }

                    // Check if there's a next page
                    if (!foundNew || !html.includes('page' + (page + 1))) {
                        hasMore = false;
                    }
                    page++;
                } catch (e) {
                    console.error('Fetch error page ' + page, e);
                    hasMore = false;
                }
            }

            return Array.from(allUrls);
        })();
    }.toString().replace('ALBUM_URL_PLACEHOLDER', JSON.stringify(albumUrl)));

    return images || [];
}

// Bulk fetch selected albums
async function fetchSelectedAlbums() {
    const checkboxes = document.querySelectorAll('#albumList .album-checkbox:checked');
    if (checkboxes.length === 0) {
        setStatus('No albums selected. Check some albums first.', 'error');
        return;
    }

    const selected = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.id,
        url: cb.dataset.url,
        title: cb.dataset.title
    }));

    document.getElementById('fetchSelectedBtn').disabled = true;
    currentData.albumResults = {};
    showProgress(0);

    for (let i = 0; i < selected.length; i++) {
        const album = selected[i];
        const pct = Math.round((i / selected.length) * 100);
        showProgress(pct);
        setStatus(`Fetching album ${i + 1}/${selected.length}: ${album.title}...`, 'loading');

        // Update individual album status
        const statusEl = document.getElementById('album-status-' + album.id);
        if (statusEl) {
            statusEl.textContent = 'fetching...';
            statusEl.className = 'album-status fetching';
        }

        const images = await fetchAlbumImages(album.url);

        currentData.albumResults[album.id] = {
            title: album.title,
            images: images
        };

        if (statusEl) {
            statusEl.textContent = images.length + ' imgs';
            statusEl.className = 'album-status done';
        }

        updateStats();
    }

    showProgress(100);
    const totalImages = Object.values(currentData.albumResults).reduce((sum, a) => sum + a.images.length, 0);
    setStatus(`Done! Fetched ${totalImages} images from ${selected.length} albums.`, 'success');

    document.getElementById('fetchSelectedBtn').disabled = false;
    updateOutput();

    // Auto-switch to output tab
    setTimeout(() => {
        document.querySelector('.tab[data-tab="output"]').click();
    }, 500);
}

// Extract images from current page
async function extractImages() {
    setStatus('Extracting images...', 'loading');

    const folderName = await executeInTab(function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var parts = document.title.split('|');
        if (parts.length > 1) return parts[0].trim();
        return document.title.trim();
    });
    if (folderName) currentData.folderName = folderName;

    const result = await executeInTab(function() {
        if (window.flickrExtractor) {
            return window.flickrExtractor.extractImages();
        }

        const images = [];
        const seen = new Set();

        document.querySelectorAll('img').forEach(img => {
            if (img.src && img.src.includes('staticflickr') && !seen.has(img.src)) {
                seen.add(img.src);
                let large = img.src
                    .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\\.png/i, '_b.png');
                images.push({
                    thumbnail: img.src,
                    large: large,
                    original: large.replace(/_b\\./i, '_o.'),
                    alt: img.alt || ''
                });
            }
        });

        document.querySelectorAll('[style*="background"]').forEach(el => {
            const match = el.style.backgroundImage.match(/url\\(['\"]?(https?:\\/\\/[^'\")\\s]+)['\"]?\\)/);
            if (match && match[1].includes('staticflickr') && !seen.has(match[1])) {
                seen.add(match[1]);
                let large = match[1]
                    .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\\.png/i, '_b.png');
                images.push({
                    thumbnail: match[1],
                    large: large,
                    original: large.replace(/_b\\./i, '_o.'),
                    alt: ''
                });
            }
        });

        return images;
    });

    if (result && result.length > 0) {
        currentData.images = result;
        setStatus(`Found ${result.length} images!`, 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found. Try scrolling or opening an album.', 'error');
    }
}

// Load all images by scrolling
async function loadAllImages() {
    setStatus('Loading all images (scrolling page)...', 'loading');
    document.getElementById('loadAllBtn').disabled = true;

    const folderName = await executeInTab(function() {
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        var parts = document.title.split('|');
        if (parts.length > 1) return parts[0].trim();
        return document.title.trim();
    });
    if (folderName) currentData.folderName = folderName;

    const result = await executeInTab(function() {
        return new Promise((resolve) => {
            let scrollCount = 0;
            let lastCount = 0;
            let noChangeCount = 0;
            const maxScrolls = 30;

            const extractCurrent = () => {
                const images = [];
                const seen = new Set();

                document.querySelectorAll('img').forEach(img => {
                    if (img.src && img.src.includes('staticflickr') && !seen.has(img.src)) {
                        seen.add(img.src);
                        let large = img.src
                            .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                            .replace(/_[smtqn]\\.png/i, '_b.png');
                        images.push({
                            thumbnail: img.src,
                            large: large,
                            original: large.replace(/_b\\./i, '_o.'),
                            alt: img.alt || ''
                        });
                    }
                });

                document.querySelectorAll('[style*="background"]').forEach(el => {
                    const match = el.style.backgroundImage && el.style.backgroundImage.match(/url\\(['\"]?(https?:\\/\\/[^'\")\\s]+)['\"]?\\)/);
                    if (match && match[1].includes('staticflickr') && !seen.has(match[1])) {
                        seen.add(match[1]);
                        let large = match[1]
                            .replace(/_[smtqn]\\.jpg/i, '_b.jpg')
                            .replace(/_[smtqn]\\.png/i, '_b.png');
                        images.push({
                            thumbnail: match[1],
                            large: large,
                            original: large.replace(/_b\\./i, '_o.'),
                            alt: ''
                        });
                    }
                });

                return images;
            };

            const interval = setInterval(() => {
                window.scrollTo(0, document.body.scrollHeight);
                scrollCount++;

                const current = extractCurrent();

                if (current.length === lastCount) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                    lastCount = current.length;
                }

                if (noChangeCount >= 3 || scrollCount >= maxScrolls) {
                    clearInterval(interval);
                    window.scrollTo(0, 0);
                    resolve(current);
                }
            }, 1200);
        });
    });

    document.getElementById('loadAllBtn').disabled = false;

    if (result && result.length > 0) {
        currentData.images = result;
        setStatus(`Loaded ${result.length} images!`, 'success');
        updateStats();
        updateOutput();
    } else {
        setStatus('No images found after scrolling.', 'error');
    }
}

// Extract albums
async function extractAlbums() {
    setStatus('Looking for albums...', 'loading');

    const result = await executeInTab(function() {
        const albums = [];
        const seen = new Set();

        document.querySelectorAll('a[href*="/albums/"], a[href*="/sets/"]').forEach(link => {
            const match = link.href.match(/\/photos\/[^\/]+\/(?:albums|sets)\/(\d+)/);
            if (match && !seen.has(match[1])) {
                seen.add(match[1]);

                let title = 'Untitled';
                const titleEl = link.querySelector('.title, [class*="title"], .overlay-content');
                if (titleEl) {
                    title = titleEl.textContent.trim();
                } else if (link.textContent.trim().length < 80) {
                    title = link.textContent.trim().split('\\n')[0];
                }

                albums.push({
                    id: match[1],
                    title: title,
                    url: link.href
                });
            }
        });

        return albums;
    });

    if (result && result.length > 0) {
        currentData.albums = result;
        setStatus(`Found ${result.length} albums`, 'success');
        renderAlbums();
        updateStats();
    } else {
        setStatus('No albums found. Make sure you\'re on an albums page.', 'error');
    }
}

// Copy to clipboard
document.getElementById('copyBtn').addEventListener('click', () => {
    const output = document.getElementById('outputArea');
    output.select();
    document.execCommand('copy');
    setStatus('Copied to clipboard!', 'success');
});

// Download as TXT
document.getElementById('downloadBtn').addEventListener('click', () => {
    const output = document.getElementById('outputArea').value;
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flickr-urls-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded!', 'success');
});

// Re-render output when size changes
document.querySelectorAll('input[name="imgSize"]').forEach(radio => {
    radio.addEventListener('change', updateOutput);
});

// Button handlers
document.getElementById('fetchSelectedBtn').addEventListener('click', fetchSelectedAlbums);
document.getElementById('extractBtn').addEventListener('click', extractImages);
document.getElementById('loadAllBtn').addEventListener('click', loadAllImages);
document.getElementById('extractAlbumsBtn').addEventListener('click', extractAlbums);

// Initialize
async function init() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
        const url = tabs[0].url;

        if (!url.includes('flickr.com')) {
            setStatus('Not a Flickr page. Please navigate to flickr.com', 'error');
            document.getElementById('extractBtn').disabled = true;
            document.getElementById('loadAllBtn').disabled = true;
            document.getElementById('fetchSelectedBtn').disabled = true;
            return;
        }

        if (url.includes('/albums') || url.includes('/sets')) {
            setStatus('Flickr albums page detected', 'success');
            extractAlbums();
        } else {
            setStatus('Flickr page detected. Ready to extract.', 'success');
            extractImages();
        }
    }
}

init();
