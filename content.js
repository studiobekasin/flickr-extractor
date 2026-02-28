// Flickr Album URL Extractor - Content Script
// This script runs on Flickr pages and extracts image URLs

(function() {
    'use strict';

    // Store extracted data
    window.flickrExtractorData = {
        albums: [],
        currentAlbumImages: [],
        pageType: 'unknown'
    };

    // Detect page type
    function detectPageType() {
        const url = window.location.href;
        if (url.includes('/albums/') || url.includes('/sets/')) {
            if (url.match(/\/albums\/?$/i) || url.match(/\/sets\/?$/i)) {
                return 'albums-list';
            }
            return 'single-album';
        }
        if (url.includes('/photos/') && !url.includes('/albums/')) {
            return 'photostream';
        }
        return 'other';
    }

    // Extract albums from albums list page
    function extractAlbums() {
        const albums = [];
        
        // Method 1: Look for album links in the page
        const albumLinks = document.querySelectorAll('a[href*="/albums/"], a[href*="/sets/"]');
        const seen = new Set();
        
        albumLinks.forEach(link => {
            const href = link.href;
            // Match album URLs like /photos/USER/albums/ALBUMID or /photos/USER/sets/ALBUMID
            const match = href.match(/\/photos\/[^\/]+\/(?:albums|sets)\/(\d+)/);
            if (match && !seen.has(match[1])) {
                seen.add(match[1]);
                
                // Try to get album title
                let title = 'Untitled Album';
                const titleEl = link.querySelector('.title, .album-title, [class*="title"]');
                if (titleEl) {
                    title = titleEl.textContent.trim();
                } else if (link.title) {
                    title = link.title;
                } else if (link.textContent.trim() && link.textContent.trim().length < 100) {
                    title = link.textContent.trim();
                }
                
                // Try to get cover image
                let coverImage = '';
                const img = link.querySelector('img');
                if (img && img.src) {
                    coverImage = img.src;
                }
                
                albums.push({
                    id: match[1],
                    title: title,
                    url: href,
                    coverImage: coverImage
                });
            }
        });

        // Method 2: Look for album data in page scripts (Flickr stores data in JS)
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const text = script.textContent;
            if (text.includes('albumModels') || text.includes('setModels')) {
                try {
                    // Try to extract album data from Flickr's inline JSON
                    const matches = text.matchAll(/"id":"(\d+)"[^}]*"title":"([^"]+)"/g);
                    for (const match of matches) {
                        if (!seen.has(match[1])) {
                            seen.add(match[1]);
                            albums.push({
                                id: match[1],
                                title: match[2],
                                url: `${window.location.origin}/photos/${window.location.pathname.split('/')[2]}/albums/${match[1]}`,
                                coverImage: ''
                            });
                        }
                    }
                } catch (e) {
                    console.log('Error parsing album data:', e);
                }
            }
        });

        return albums;
    }

    // Extract images from current page (album or photostream)
    function extractImages() {
        const images = [];
        const seen = new Set();

        // Method 1: Find all photo links and their images
        const photoContainers = document.querySelectorAll('[class*="photo"], [class*="Photo"], .overlay, .photo-list-photo-view');
        
        photoContainers.forEach(container => {
            const img = container.querySelector('img');
            const link = container.querySelector('a[href*="/photos/"]');
            
            if (img && img.src && !seen.has(img.src)) {
                seen.add(img.src);
                
                // Convert thumbnail URL to larger size
                let largeUrl = img.src
                    .replace(/_[smtqn]\.jpg/i, '_b.jpg')  // Small to Large
                    .replace(/_[smtqn]\.png/i, '_b.png')
                    .replace(/\/\d+x\d+\//i, '/');  // Remove size constraints
                
                // Get original if possible
                let originalUrl = largeUrl.replace(/_b\.(jpg|png)/i, '_o.$1');
                
                images.push({
                    thumbnail: img.src,
                    large: largeUrl,
                    original: originalUrl,
                    alt: img.alt || '',
                    photoPageUrl: link ? link.href : ''
                });
            }
        });

        // Method 2: Look for background images (Flickr uses these too)
        const bgElements = document.querySelectorAll('[style*="background-image"]');
        bgElements.forEach(el => {
            const style = el.getAttribute('style');
            const match = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
            if (match && match[1] && match[1].includes('staticflickr') && !seen.has(match[1])) {
                seen.add(match[1]);
                let largeUrl = match[1]
                    .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                    .replace(/_[smtqn]\.png/i, '_b.png');
                
                images.push({
                    thumbnail: match[1],
                    large: largeUrl,
                    original: largeUrl.replace(/_b\.(jpg|png)/i, '_o.$1'),
                    alt: '',
                    photoPageUrl: ''
                });
            }
        });

        // Method 3: Look in script tags for photo data
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            const text = script.textContent;
            // Look for staticflickr URLs in the script
            const urlMatches = text.matchAll(/https:\/\/live\.staticflickr\.com\/\d+\/[^"'\s]+/g);
            for (const match of urlMatches) {
                const url = match[0];
                if (!seen.has(url) && (url.endsWith('.jpg') || url.endsWith('.png'))) {
                    seen.add(url);
                    let largeUrl = url
                        .replace(/_[smtqn]\.jpg/i, '_b.jpg')
                        .replace(/_[smtqn]\.png/i, '_b.png');
                    
                    images.push({
                        thumbnail: url,
                        large: largeUrl,
                        original: largeUrl.replace(/_b\.(jpg|png)/i, '_o.$1'),
                        alt: '',
                        photoPageUrl: ''
                    });
                }
            }
        });

        return images;
    }

    // Scroll and load all images (Flickr uses infinite scroll)
    async function loadAllImages(maxScrolls = 50) {
        return new Promise((resolve) => {
            let scrollCount = 0;
            let lastImageCount = 0;
            let noChangeCount = 0;
            
            const scrollInterval = setInterval(() => {
                // Scroll down
                window.scrollTo(0, document.body.scrollHeight);
                scrollCount++;
                
                // Count current images
                const currentImages = extractImages();
                
                if (currentImages.length === lastImageCount) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                    lastImageCount = currentImages.length;
                }
                
                // Stop if no new images after 3 scrolls or max reached
                if (noChangeCount >= 3 || scrollCount >= maxScrolls) {
                    clearInterval(scrollInterval);
                    resolve(currentImages);
                }
            }, 1500);
        });
    }

    // Initialize
    function init() {
        window.flickrExtractorData.pageType = detectPageType();
        
        // Initial extraction
        if (window.flickrExtractorData.pageType === 'albums-list') {
            window.flickrExtractorData.albums = extractAlbums();
        }
        window.flickrExtractorData.currentAlbumImages = extractImages();
    }

    // Run after page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-run when page content changes (for dynamic loading)
    const observer = new MutationObserver(() => {
        if (window.flickrExtractorData.pageType === 'albums-list') {
            window.flickrExtractorData.albums = extractAlbums();
        }
        window.flickrExtractorData.currentAlbumImages = extractImages();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Expose functions for popup
    window.flickrExtractor = {
        extractAlbums,
        extractImages,
        loadAllImages,
        getData: () => window.flickrExtractorData
    };

})();
