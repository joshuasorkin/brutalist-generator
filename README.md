# Brutalist Architecture Slideshow

A digital art installation featuring an endless morphing slideshow of AI-generated brutalist architecture images. Designed for wall-mounted tablets and digital frames.

## What It Does

1. **Image Generation**: Generates brutalist building images using OpenAI's gpt-image-1 model
2. **Cloud Storage**: Stores compressed images on Cloudflare R2 for fast delivery
3. **Slideshow Display**: Full-screen PWA with canvas-based transitions (mosaic, grid reveal, container transform)
4. **Cloud Hosting**: Deployed on Fly.io for 24/7 availability

## Live Demo

https://brutalist-generator.fly.dev

## Prerequisites

- Node.js 18+
- OpenAI API key with access to gpt-image-1
- Cloudflare account (for R2 storage)
- Fly.io account (for hosting)
- Wrangler CLI (`npm install -g wrangler`)
- Fly CLI (https://fly.io/docs/hands-on/install-flyctl/)

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.local.example .env.local
   ```

3. Edit `.env.local` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

4. Authenticate with Cloudflare and Fly.io:
   ```bash
   wrangler login
   fly auth login
   ```

## Adding New Images (Full Pipeline)

The easiest way to add images is the unified pipeline command:

```bash
npm run pipeline -- -n 10
```

This single command will:
1. **Generate** 10 new PNG images via OpenAI (numbered after existing images)
2. **Export** them to compressed JPEGs (~85% smaller)
3. **Upload** only new images to Cloudflare R2
4. **Update** the manifest with R2 URLs

After the pipeline completes, deploy to update the live site:

```bash
fly deploy
```

### Pipeline Options

```bash
npm run pipeline -- -n 20      # Generate 20 new images
npm run pipeline -- --count=5  # Generate 5 new images
```

## Individual Commands

You can also run each step separately:

```bash
# Generate images (PNGs to public/brutalism/)
npm run generate:brutalism           # Generate up to 300 images
npm run generate:brutalism -- -n 10  # Generate 10 NEW images

# Export to compressed JPEGs (BrutalFrame/)
npm run export:tablet

# Upload new images to R2
npm run upload:r2

# Deploy to Fly.io
fly deploy
```

## Running Locally

### Development Mode

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Production Build

```bash
npm run build
npm run start
```

## Configuration

### Slideshow Timing

Edit `app/page.tsx`:

```typescript
const DISPLAY_MS = 10000;      // Time each image is shown (ms)
const TRANSITION_MS = 3000;    // Transition duration (ms)
const GRID_COLS = 16;          // Grid reveal columns
const GRID_ROWS = 12;          // Grid reveal rows
```

### Image Generation

Edit `scripts/lib/prompt-vocabulary.ts` to customize:
- Building types
- Lighting conditions
- Concrete expressions
- Camera angles
- Regional styles

## Mobile/Tablet Setup (PWA)

The app is a Progressive Web App that runs fullscreen on mobile devices.

### iOS
1. Open https://brutalist-generator.fly.dev in Safari
2. Tap Share → "Add to Home Screen"
3. Launch from home screen icon

### Android
1. Open https://brutalist-generator.fly.dev in Chrome
2. Tap menu (⋮) → "Install app"
3. Launch from home screen icon

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   OpenAI API    │────▶│  Local Storage  │────▶│  Cloudflare R2  │
│  (gpt-image-1)  │     │  (PNG → JPEG)   │     │  (53MB images)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Browser     │◀────│     Fly.io      │◀────│   R2 Images     │
│   (PWA/Canvas)  │     │   (Next.js)     │     │  (CDN delivery) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Project Structure

```
├── app/
│   ├── page.tsx              # Main slideshow component
│   ├── layout.tsx            # PWA metadata
│   └── globals.css           # Styles
├── data/
│   ├── brutalismManifest.json    # Image URLs for slideshow
│   ├── r2-manifest.json          # R2 upload tracking
│   └── promptLog.json            # Generation metadata
├── public/
│   ├── brutalism/            # Source PNGs (not deployed)
│   ├── images/               # Compressed JPEGs (not deployed)
│   ├── icons/                # PWA icons
│   └── manifest.json         # PWA manifest
├── scripts/
│   ├── generate-brutalism.ts # Image generation
│   ├── generate-pipeline.ts  # Full pipeline orchestration
│   ├── export-tablet.ts      # PNG → JPEG compression
│   ├── upload-r2.ts          # R2 upload with tracking
│   └── lib/
│       ├── prompt-vocabulary.ts  # Prompt components
│       ├── geo.ts                # Geospatial features
│       └── random.ts             # Seeded RNG
├── BrutalFrame/              # Compressed JPEG export
├── Dockerfile                # Fly.io deployment
├── fly.toml                  # Fly.io config
└── r2-cors.json              # R2 CORS config
```

## Troubleshooting

### "No images found" message
Run the pipeline: `npm run pipeline -- -n 10`

### CORS errors on images
Ensure R2 CORS is configured:
```bash
wrangler r2 bucket cors set brutalist-images --file=./r2-cors.json
```

### Canvas tainted by cross-origin data
Images must have `crossOrigin = "anonymous"` and R2 must send CORS headers.

### 502 errors on Fly.io
Check logs: `fly logs -a brutalist-generator`

## License

MIT
