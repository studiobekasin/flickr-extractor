// Flickr Album URL Extractor - Popup Script

let currentData = {
    albums: [],
    images: [],
    pageType: 'unknown',
    folderName: ''
};

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
});

// Update status
function setStatus(message, type = '') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

// Update stats
function updateStats() {
    document.getElementById('albumCount').textContent = currentData.albums.length;
    document.getElementById('imageCount').textContent = currentData.images.length;
}

// Render albums list
function renderAlbums() {
    const list = document.getElementById('albumList');
    
    if (currentData.albums.length === 0) {
        list.innerHTML = '<div class="album-item">No albums found on this page</div>';
        return;
    }
    
    list.innerHTML = currentData.albums.map((album, index) => `
        <div class="album-item" data-url="${album.url}" data-index="${index}">
            <span class="album-name">${album.title || 'Untitled'}</span>
            <span class="album-count">→</span>
        </div>
    `).join('');
    
    // Add click handlers
    list.querySelectorAll('.album-item').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            if (url) {
                browser.tabs.update({ url: url });
                window.close();
            }
        });
    });
}

// Update output textarea
function updateOutput() {
    const useLarge = document.getElementById('useLarge').checked;
    const output = document.getElementById('outputArea');
    
    if (currentData.images.length === 0) {
        output.value = '// No images extracted yet\n// Click "Extract Current Page Images" first';
        return;
    }
    
    let text = '';
    
    if (currentData.folderName) {
        text += `${currentData.folderName}\n\n`;
    }
    
    currentData.images.forEach((img, index) => {
        const url = useLarge ? img.large : img.original;
        text += url + '\n';
    });
    
    output.value = text;
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

// Extract images from current tab
async function extractImages() {
    setStatus('Extracting images...', 'loading');
    
    // Get the folder/album name from the Flickr page
    const folderName = await executeInTab(function() {
        // Try album title selectors
        var el = document.querySelector('.album-title-cntl, h1.title, .album-title, .set-title');
        if (el) return el.textContent.trim();
        // Fallback: parse from page title (e.g. "Album Name | Flickr")
        var parts = document.title.split('|');
        if (parts.length > 1) return parts[0].trim();
        return document.title.trim();
    });
    if (folderName) currentData.folderName = folderName;
    
    const result = await executeInTab(function() {
        if (window.flickrExtractor) {
            return window.flickrExtractor.extractImages();
        }
        
        // Fallback extraction
        const images = [];
        const seen = new Set();
        
        // Find all images
        document.querySelectorAll('img').forEach(img => {
            if (img.src && img.src.includes('staticflickr') && !seen.has(img.src)) {
                seen.add(img.src);
                let large = img.src
                    .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\.png/i, '_b.png');
                images.push({
                    thumbnail: img.src,
                    large: large,
                    original: large.replace(/_b\./i, '_o.'),
                    alt: img.alt || ''
                });
            }
        });
        
        // Find background images
        document.querySelectorAll('[style*="background"]').forEach(el => {
            const match = el.style.backgroundImage.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
            if (match && match[1].includes('staticflickr') && !seen.has(match[1])) {
                seen.add(match[1]);
                let large = match[1]
                    .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\.png/i, '_b.png');
                images.push({
                    thumbnail: match[1],
                    large: large,
                    original: large.replace(/_b\./i, '_o.'),
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
    
    // Get the folder/album name from the Flickr page
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
                            .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                            .replace(/_[smtqn]\.png/i, '_b.png');
                        images.push({
                            thumbnail: img.src,
                            large: large,
                            original: large.replace(/_b\./i, '_o.'),
                            alt: img.alt || ''
                        });
                    }
                });
                
                document.querySelectorAll('[style*="background"]').forEach(el => {
                    const match = el.style.backgroundImage && el.style.backgroundImage.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
                    if (match && match[1].includes('staticflickr') && !seen.has(match[1])) {
                        seen.add(match[1]);
                        let large = match[1]
                            .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                            .replace(/_[smtqn]\.png/i, '_b.png');
                        images.push({
                            thumbnail: match[1],
                            large: large,
                            original: large.replace(/_b\./i, '_o.'),
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
                    title = link.textContent.trim().split('\n')[0];
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

// Checkbox change handlers
document.getElementById('useLarge').addEventListener('change', updateOutput);

// Button handlers
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
            return;
        }
        
        if (url.includes('/albums') || url.includes('/sets')) {
            setStatus('Flickr albums page detected', 'success');
            extractAlbums();
        } else {
            setStatus('Flickr page detected. Ready to extract.', 'success');
        }
        
        // Initial image extraction
        extractImages();
    }
}

init();
