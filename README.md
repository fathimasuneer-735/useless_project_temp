# Appam Roundness Analyzer 🍳

A joke-serious React + Vite app that "analyzes" a photo of an appam and
reports its Roundness %, Symmetry %, visible hole count, visual thickness,
Shape Grade, a funny AI comment, and a
(scientifically fixed) 100% Uselessness Score.

It's real client-side image processing — grayscale conversion, Otsu
thresholding, connected-component detection, and centroid-based
symmetry checks, all on `<canvas>` — just pointed at a completely
frivolous goal. No backend, no ML model, no data leaves your browser.

## Setup

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Using it

1. Click/tap the round dropzone, or drag a photo onto it.
2. Best results: a top-down photo of the appam on a plate/surface that
   contrasts with it (e.g. a light appam on a dark plate, or vice versa).
3. Wait ~half a second for the "analysis" to complete.
4. Admire your Roundness %, Symmetry %, hole count, visual thickness, Shape Grade, and the AI's
   completely unnecessary commentary.
5. Hit "Analyze Another Appam 🍳" to reset and try again.

## How the "analysis" actually works

1. The uploaded image is drawn to an off-screen canvas and downscaled.
2. It's converted to grayscale, then split into foreground/background
   using [Otsu's method](https://en.wikipedia.org/wiki/Otsu%27s_method)
   (an automatic thresholding algorithm).
3. A flood-fill keeps only the largest connected blob (assumed to be
   the appam), ignoring small specks.
4. **Roundness** compares the blob's bounding-box fill ratio and aspect
   ratio against what a perfect circle would produce.
5. **Symmetry** mirrors the shape across its centroid on both axes and
   measures how much it overlaps itself.
6. Shape Grade, the funny comment, and the Uselessness Score are just
   thresholds and a joke-line lookup table — no AI model is called.

Hole count is based on enclosed background regions in the detected appam blob.
Visual thickness is an image-relative estimate in pixels; physical thickness
requires a known scale or a side-on photo.

## Project structure

```
appam-analyzer/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx          # entry point
    ├── App.jsx           # UI: upload flow + results card
    ├── App.css           # theming
    └── analyzeAppam.js   # the "vision" pipeline
```

## Build for production

```bash
npm run build
npm run preview   # serve the production build locally
```

Enjoy judging your appams. No appams were harmed — only lovingly roasted. 🥥
