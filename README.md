# Photo Album Journal

A lightweight static photo album journal built with browser-native technologies only:

- `index.html`
- `styles.css`
- `data.js`
- `app.js`

It opens locally in a browser without npm, a build step, or a backend, and it is ready to publish on GitHub Pages.

## Preview Locally

1. Open [/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/index.html](/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/index.html) directly in a browser.
2. Or serve the folder with any simple static server if you prefer, but no server is required.

## Manage Photos

1. Upload each photo to Cloudinary.
2. Update the matching `src` value in [/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js](/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js) with its Cloudinary delivery URL.
3. Optional: add `objectPosition` to any photo object if a subject needs better cropping.

Use public Cloudinary URLs only; visitors need access to every image shown in the album.

## Bengali Audio

Add the Bengali MP3 URL directly inside the matching entry in `bengali.entries`:

```js
"2026-06-09": {
  title: "টরন্টোয় আগমন",
  description: "...",
  audio: "https://res.cloudinary.com/YOUR_CLOUD_NAME/video/upload/2026-06-09-bn.mp3",
},
```

The Bengali `Listen` button plays the supplied MP3. English narration continues to use the device's browser text-to-speech voice.

## Add Gallery Videos

Add YouTube Shorts links to the shared `gallery` list in [/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js](/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js). They appear at the bottom of the album in both languages:

```js
gallery: [
  "https://www.youtube.com/shorts/VIDEO_ID",
  "https://youtu.be/VIDEO_ID",
],
```

Set `amazonPhotosUrl` to an Amazon Photos share link or an Amazon Photos app link to show an `Amazon Photos` button above the video grid.

## Add a New Journal Entry

1. Open [/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js](/Users/rajdeepchowdhuri/Desktop/Temp/R&D/Photo Album/data.js).
2. Add a new object inside `entries` with `date`, `title`, `description`, and `photos`.
3. Use the same date format: `YYYY-MM-DD`.
4. Add up to three photo objects, or leave `photos: []` for a text-only entry.

The app sorts entries chronologically at runtime, so minor ordering mistakes in `data.js` will not break the album.

## Change the Cover

1. Update `albumTitle`, `dateRange`, or `subtitle` in `data.js`.
2. Replace the three `coverPhotos` paths with your final cover images.
3. Keep three images for the intended collage layout, or trim the array if you want a simpler cover.

## Publish With GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository settings, open `Pages`.
3. Set the deployment source to the main branch and the root folder, or `/docs` if you later move the files there.
4. Wait for GitHub Pages to publish the site.

Because the site uses Cloudinary image URLs, the GitHub repository stays small while the album still works from a GitHub Pages project URL such as `https://username.github.io/photo-album/`.

## Design Approach

The visual direction uses a warm editorial scrapbook look: a textured paper background, serif display typography, soft shadows, rounded photo cards, alternating entry layouts, and a translucent sticky header for month/date navigation.

## Assumptions and Open Questions

- Photo files are hosted by Cloudinary and are not stored in this repository.
