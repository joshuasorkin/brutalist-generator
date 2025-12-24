# Brutalist Architecture Slideshow

A digital art installation featuring an endless morphing slideshow of AI-generated brutalist architecture images. Designed for wall-mounted tablets and digital frames.

## What It Does

1. **Image Generation**: A Node.js script generates a library of brutalist building images using the OpenAI Images API (gpt-image-1 model).

2. **Slideshow Display**: A Next.js app displays the images in a full-screen, continuous slideshow with smooth crossfade transitions, subtle zoom effects, and blur to create a "morphing" visual effect.

## Prerequisites

- Node.js 18+
- npm
- OpenAI API key with access to the gpt-image-1 model

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

## Generating Images

Run the image generation script:

```bash
npm run generate:brutalism
```

This will:
- Generate 60 brutalist architecture images (configurable in the script)
- Save them to `public/brutalism/`
- Create a manifest at `data/brutalismManifest.json`

**Note**: Generation can take significant time depending on API rate limits. Each image takes a few seconds to generate.

To change the number of images, edit `scripts/generate-brutalism.ts` and modify the `NUM_IMAGES` constant.

## Running the Slideshow

### Development Mode

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Configuration

### Slideshow Timing

Edit `app/page.tsx` to adjust:

- `DISPLAY_MS`: How long each image is shown (default: 20000ms / 20 seconds)
- `FADE_MS`: Duration of crossfade transitions (default: 4000ms / 4 seconds)

### Image Generation Prompts

Edit `scripts/generate-brutalism.ts` to customize:

- `NUM_IMAGES`: Number of images to generate
- `BUILDING_TYPES`: Types of brutalist buildings
- `LIGHTING_CONDITIONS`: Lighting/atmosphere options
- `STYLISTIC_ELEMENTS`: Visual style descriptors

## Tablet Setup

For the best experience on a wall-mounted tablet:

1. Open the slideshow URL in the tablet's browser
2. Add to home screen (iOS: Share → Add to Home Screen)
3. Launch from the home screen icon for full-screen, standalone mode
4. Enable "Do Not Disturb" and disable auto-lock

The app is configured with proper meta tags for:
- iOS standalone web app mode
- Full-screen display
- No zoom/scroll behavior

## Project Structure

```
project-root/
├── app/
│   ├── page.tsx          # Main slideshow component
│   ├── layout.tsx        # Root layout with meta tags
│   └── globals.css       # Styles and animations
├── data/
│   └── brutalismManifest.json  # Generated image list
├── public/
│   └── brutalism/        # Generated images
├── scripts/
│   └── generate-brutalism.ts   # Image generation script
├── package.json
├── tsconfig.json
├── tsconfig.scripts.json
├── next.config.mjs
├── .env.local.example
└── README.md
```

## Troubleshooting

### "No images found" message
Run the generation script first: `npm run generate:brutalism`

### API errors during generation
- Check your API key is correct in `.env.local`
- Ensure you have access to the gpt-image-1 model
- Check your API usage limits

### Images not loading
- Verify images exist in `public/brutalism/`
- Check the manifest at `data/brutalismManifest.json` has entries
- Try running `npm run build` and `npm run start`

## License

MIT
