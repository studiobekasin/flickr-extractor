# 📷 Flickr Album URL Extractor - Firefox Extension

A Firefox extension to extract all image URLs from your Flickr albums for use in web projects.

## Installation

### Method 1: Temporary Installation (For Testing)

1. Open Firefox
2. Type `about:debugging` in the address bar
3. Click **"This Firefox"** on the left
4. Click **"Load Temporary Add-on..."**
5. Navigate to the extension folder and select `manifest.json`
6. The extension icon will appear in your toolbar

### Method 2: Permanent Installation

1. Zip all the files in this folder
2. Rename the `.zip` to `.xpi`
3. Open Firefox and drag the `.xpi` file into the browser
4. Click "Add" when prompted

## How to Use

### Step 1: Go to Your Flickr Albums
Navigate to: `https://www.flickr.com/photos/YOUR_USER_ID/albums/`

### Step 2: Click the Extension Icon
A popup will appear showing:
- Number of albums found
- Number of images detected

### Step 3: Extract Images

**For current page:**
- Click **"🔍 Extract Current Page Images"** to get visible images

**For all images in an album:**
1. Click on an album name to open it
2. Click **"📥 Load All Images (Scroll)"** - this will auto-scroll and load all images

### Step 4: Copy URLs
1. Go to the **"Output"** tab
2. Choose URL size (Large recommended for websites)
3. Click **"📋 Copy to Clipboard"**
4. Paste into Claude or save for later

## URL Sizes Explained

| Suffix | Size | Best For |
|--------|------|----------|
| `_s` | 75x75 square | Thumbnails |
| `_q` | 150x150 square | Small thumbnails |
| `_t` | 100px | Tiny previews |
| `_m` | 240px | Small images |
| `_n` | 320px | Mobile |
| `_b` | 1024px | **Website use ✓** |
| `_c` | 800px | Medium quality |
| `_o` | Original | Highest quality |

## Output Format

The extension outputs URLs like this:

```
// Flickr URLs extracted on 2/25/2026, 2:00:00 PM
// Total images: 25

https://live.staticflickr.com/65535/12345678901_abcdef1234_b.jpg
https://live.staticflickr.com/65535/12345678902_abcdef1235_b.jpg
...
```

## Tips

1. **For large albums**: Use "Load All Images" - it auto-scrolls to load everything
2. **Organize by category**: Check "Group by album/category" in Output tab
3. **Best quality for web**: Use Large (_b) size - good balance of quality and speed

## Troubleshooting

**"No images found"**
- Make sure you're on a Flickr album page
- Try clicking "Load All Images" to scroll and load more

**Extension not working**
- Refresh the Flickr page
- Re-click the extension icon

**Images missing**
- Some private albums may not be accessible
- Try scrolling manually first, then extract

## Files

```
flickr-extractor/
├── manifest.json   # Extension configuration
├── content.js      # Runs on Flickr pages
├── popup.html      # Extension popup UI
├── popup.js        # Popup logic
├── icon.png        # Extension icon
└── README.md       # This file
```

---

Made for Studio Arabadzhiev 📷
