# Icon Pipeline

CLI tool that reads SVG files, applies per-icon color configuration, and outputs PNGs at specified pixel sizes.

## Folder Structure

```
icon-pipeline/
├── src/                    # TypeScript source code
│   ├── index.ts           # CLI entrypoint
│   ├── types.ts           # TypeScript type definitions
│   ├── config.ts          # Configuration loading and validation
│   ├── scanner.ts         # SVG file discovery and validation
│   ├── recolor.ts         # SVG normalization and recoloring
│   ├── compose.ts         # Background shape composition
│   ├── rasterize.ts       # SVG to PNG conversion
│   ├── preview.ts         # HTML preview generator
│   ├── verify.ts          # Build verification
│   ├── cli-preview.ts     # Preview CLI entrypoint
│   └── cli-verify.ts      # Verify CLI entrypoint
├── icons-src/             # Input SVG files go here
├── icons-dist/            # Generated PNG files
│   ├── {size}/            # PNGs organized by size (32/, 64/, 96/)
│   ├── preview/           # Preview HTML (generated)
│   └── manifest.json      # Build manifest with metadata
├── .build/                # Temporary build artifacts (gitignored)
│   ├── recolored/         # Recolored SVG intermediates
│   └── composed/          # Composed SVGs with background shapes
├── config/
│   ├── icons.config.json  # Per-icon color and layer configuration
│   ├── icons.schema.json  # JSON schema for icons config
│   ├── sizes.config.json  # Pixel sizes to generate
│   └── sizes.schema.json  # JSON schema for sizes config
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
npm install
```

## Usage

Build all icons:

```bash
npm run build
```

Clean build (wipes all generated files first):

```bash
npm run build -- --clean
```

Generate preview page:

```bash
npm run preview
```

Verify build output:

```bash
npm run verify
```

### Build Pipeline

The build runs these steps in order:

1. **Validate** - Load configs, scan SVG files, validate filenames
2. **Recolor** - Normalize SVGs and apply layer colors → `.build/recolored/`
3. **Compose** - Add background shapes → `.build/composed/`
4. **Rasterize** - Convert to optimized PNGs → `icons-dist/{size}/`
5. **Manifest** - Generate `icons-dist/manifest.json`
6. **Verify** - Check all outputs are consistent and within limits

### CLI Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Full build pipeline |
| `npm run build -- --clean` | Clean build (wipes generated files first) |
| `npm run preview` | Generate `icons-dist/preview/index.html` |
| `npm run verify` | Verify build output consistency |

### Verification Checks

The verify step (runs automatically at end of build) checks:

- Every icon in config has a corresponding SVG in `icons-src/`
- Every SVG produced PNGs for all configured sizes
- No PNG exceeds 50KB (configurable)
- `manifest.json` is consistent with files on disk

## Configuration

### Sizes Configuration (`config/sizes.config.json`)

Defines which pixel dimensions and output mode to use:

```json
{
  "densityMode": "both",
  "sizes": [32, 64, 96]
}
```

| Property | Description |
|----------|-------------|
| `densityMode` | Output mode: `size-folders`, `density`, or `both` (default: `size-folders`) |
| `sizes` | Array of pixel dimensions (1-4096). For density mode, exactly 3 sizes required (1x, 2x, 3x) |

#### Density Modes

| Mode | Output Structure | Use Case |
|------|------------------|----------|
| `size-folders` | `icons-dist/{size}/{icon}.png` | Web, general use |
| `density` | `icons-dist/{icon}.png`, `{icon}@2x.png`, `{icon}@3x.png` | React Native |
| `both` | Both structures | Multi-platform projects |

When using `density` or `both` mode:
- The first size is the 1x base size
- Second size is 2x (should be 2× the base)
- Third size is 3x (should be 3× the base)
- An `icons.ts` file is generated for React Native imports

### Icons Configuration (`config/icons.config.json`)

Defines per-icon theming with background colors and layer mappings:

```json
{
  "icons": {
    "incident": {
      "background": "#FF3B30",
      "shape": "circle",
      "layers": {
        "fill": "#FFFFFF",
        "stroke": "#000000"
      }
    },
    "work_zone": {
      "background": "#FF9500",
      "shape": "rounded-square",
      "padding": 0.25,
      "layers": {
        "fill": "#000000"
      }
    }
  },
  "defaults": {
    "background": "#333333",
    "shape": "circle",
    "layers": {
      "fill": "#FFFFFF",
      "stroke": "#FFFFFF"
    }
  }
}
```

#### Configuration Properties

| Property | Description |
|----------|-------------|
| `icons` | Object mapping icon keys to their specific configurations |
| `defaults` | Fallback configuration for icons without explicit config |
| `background` | Hex color for the background shape |
| `shape` | Background shape type: `circle`, `rounded-square`, `square`, or `none` (default: `circle`) |
| `padding` | Padding ratio 0-1 for icon inset from edges (default: `0.2` = 20%) |
| `layers` | Object mapping SVG element IDs or class names to hex colors |

#### Layer Color Mapping

The `layers` object maps SVG element identifiers to colors:
- Keys can be element IDs (e.g., `"fill"`, `"stroke"`)
- Values must be hex colors in `#RRGGBB` format
- The pipeline finds elements with matching `id` or `class` attributes and applies the color

## SVG Recoloring

The pipeline normalizes and recolors SVGs before PNG generation.

### Normalization

Every SVG is normalized:
- **viewBox required**: SVGs must have a `viewBox` attribute (error if missing)
- **width/height stripped**: Removed so viewBox controls sizing
- **External references removed**: `<image>` tags and external `href`/`xlink:href` are stripped

### Recoloring Methods

#### 1. Semantic Recoloring (Preferred)

If SVG elements have `id` or `class` attributes matching layer keys:

```xml
<!-- SVG with semantic layer IDs -->
<svg viewBox="0 0 24 24">
  <path id="fill" d="..." />      <!-- Gets fill from layers.fill -->
  <path id="stroke" d="..." />    <!-- Gets stroke from layers.stroke -->
</svg>
```

- Elements with `id="fill"` or `class="fill"` get `fill` attribute set
- Elements with `id="stroke"` or `class="stroke"` get `stroke` attribute set
- Existing `fill="none"` or `stroke="none"` are preserved

#### 2. Fallback Recoloring

If no semantic matches are found, fallback recoloring applies:

- All existing `fill` attributes (except `"none"`) → replaced with `layers.fill`
- All existing `stroke` attributes (except `"none"`) → replaced with `layers.stroke`
- Elements with no fill/stroke → get `fill` added (handles black-by-default paths)
- Root `<svg>` stroke/fill (for inheritance) → also replaced

**Example**: A path with no attributes defaults to black in browsers:
```xml
<path d="M7.5 14C11..."/>  <!-- No fill/stroke = black by default -->
```
After fallback recoloring:
```xml
<path d="M7.5 14C11..." fill="#FFFFFF"/>  <!-- Now uses theme color -->
```

### Build Output

Recolored SVGs are written to `.build/recolored/{iconKey}.svg`

The build summary shows:
- Number of icons using semantic vs fallback recoloring
- Warnings for SVGs without semantic layer IDs
- Errors for invalid SVGs (missing viewBox, parse errors)

## Background Shape Composition

After recoloring, each icon is composed with a background shape.

### Shape Types

| Shape | Description |
|-------|-------------|
| `circle` | Circular background (default) |
| `rounded-square` | Square with ~15% corner radius |
| `square` | Sharp-cornered square |
| `none` | No background, just the recolored icon |

### Composition Process

1. A square canvas is created (100x100 internal viewBox)
2. The background shape is drawn filled with the `background` color
3. The recolored icon SVG is centered on top with `padding` inset

**Padding example** with `padding: 0.2` (default):
- Icon occupies 60% of the canvas (100% - 20% padding on each side)
- Icon is centered both horizontally and vertically

### Composed Output

Composed SVGs are written to `.build/composed/{iconKey}.svg`

These are the final SVGs ready for rasterization to PNG.

### Icon Key Naming Convention

Icon keys are derived from SVG filenames (without the `.svg` extension):

- Must be **lowercase**
- Only **alphanumeric characters** and **underscores** allowed
- Pattern: `^[a-z0-9_]+$`

**Valid examples:**
- `incident.svg` → key: `incident`
- `work_zone.svg` → key: `work_zone`
- `weather_station_v2.svg` → key: `weather_station_v2`

**Invalid examples:**
- `My-Icon.svg` → Invalid (uppercase, hyphen)
- `icon 1.svg` → Invalid (space)
- `icon.special.svg` → Invalid (dot in name)

## Output

### Directory Structure

Generated PNG files are organized based on `densityMode`:

**Size-folders mode** (`densityMode: "size-folders"`):
```
icons-dist/
├── 32/
│   ├── incident.png
│   └── ...
├── 64/
│   └── ...
├── 96/
│   └── ...
├── preview/
│   └── index.html
└── manifest.json
```

**Density mode** (`densityMode: "density"`):
```
icons-dist/
├── incident.png       # 1x (32px)
├── incident@2x.png    # 2x (64px)
├── incident@3x.png    # 3x (96px)
├── icons.ts           # React Native imports
├── preview/
│   └── index.html
└── manifest.json
```

**Both mode** (`densityMode: "both"`):
```
icons-dist/
├── 32/
│   ├── incident.png
│   └── ...
├── 64/...
├── 96/...
├── incident.png       # 1x
├── incident@2x.png    # 2x
├── incident@3x.png    # 3x
├── icons.ts
├── preview/
│   └── index.html
└── manifest.json
```

### React Native Integration

When using `density` or `both` mode, an `icons.ts` file is generated for easy React Native imports:

```typescript
// Auto-generated icons.ts
export const icons = {
  incident: require('./incident.png'),
  work_zone: require('./work_zone.png'),
  // ...
} as const;

export type IconName = keyof typeof icons;
```

Usage in React Native:

```tsx
import { Image } from 'react-native';
import { icons, IconName } from './icons-dist/icons';

// Direct usage
<Image source={icons.incident} />

// Dynamic usage
function Icon({ name }: { name: IconName }) {
  return <Image source={icons[name]} />;
}
```

React Native automatically selects the correct density file (@1x, @2x, @3x) based on the device's screen density.

### Manifest

`icons-dist/manifest.json` contains build metadata:

```json
{
  "generatedAt": "2026-02-01T12:00:00.000Z",
  "densityMode": "both",
  "sizes": [32, 64, 96],
  "baseSize": 32,
  "icons": {
    "incident": {
      "shape": "circle",
      "background": "#FF3B30",
      "files": {
        "32": "32/incident.png",
        "64": "64/incident.png",
        "96": "96/incident.png"
      },
      "densityFiles": {
        "1x": "incident.png",
        "2x": "incident@2x.png",
        "3x": "incident@3x.png"
      }
    }
  }
}
```

The manifest includes:
- `densityMode`: The output mode used
- `baseSize`: The 1x base size (only in density/both mode)
- `files`: Size-folder paths (only in size-folders/both mode)
- `densityFiles`: Density variant paths (only in density/both mode)

### PNG Optimization

All PNGs are optimized with lossless compression (sharp, compression level 9).

### Preview Page

Run `npm run preview` to generate `icons-dist/preview/index.html`:

- Self-contained HTML (no external dependencies)
- Shows all icons at all sizes
- Displays each icon on light and dark backgrounds for contrast testing
- Shows metadata: icon key, shape, background color, file size

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error (invalid config, invalid filename, etc.) |

## Development

Compile TypeScript without running:

```bash
npm run compile
```

Run the CLI directly (after compiling):

```bash
npm start
```

## JSON Schema Validation

Both config files include `$schema` references for IDE validation support:
- `config/icons.schema.json` - Schema for icons configuration
- `config/sizes.schema.json` - Schema for sizes configuration

Editors like VS Code will provide autocomplete and validation when editing config files.
