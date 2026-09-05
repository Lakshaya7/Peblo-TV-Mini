# AI cover pages

Each show reads its cover page from this folder (`viewer/public/covers/`) and
shows it as the hero/banner in the viewer. These covers come from two character
promo renders (`/Users/Admin/img1.png` and `img2.png`), each cropped into four
distinct 16:9 crops so no two shows look identical.

| Show | Source | File |
|---|---|---|
| The Jungle Crew | img1 (crop 1) | `jungle-crew.webp` |
| Tales of the Deep | img1 (crop 2) | `tales-of-the-deep.webp` |
| Little Scientists | img1 (crop 3) | `little-scientists.webp` |
| Space Rovers | img1 (crop 4) | `space-rovers.webp` |
| The Lost Kingdom | img2 (crop 1) | `the-lost-kingdom.webp` |
| Comedy Canvas | img2 (crop 2) | `comedy-canvas.webp` |
| Wonder Woods | img2 (crop 3) | `wonder-woods.webp` |
| Ocean Detectives | img2 (crop 4) | `ocean-detectives.webp` |

To regenerate at another crop, reuse the punch-in approach in this table: each
image (2940×1912) is center-cropped at 2940/1654 → 2550/1434 → 2200/1238 →
1900/1069 and downsampled to 1280×720 webp (q82). A missing file simply falls
back to the episode artwork — nothing breaks until the image is added.