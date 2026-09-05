# Show cover pages

Each show reads its cover page from this folder (`viewer/public/covers/`).

Covers come from the show key-art in `peblo-tv-mini/img/` (one 2:3 poster per
show), converted to `600×780` webp. On the home hero and the show page the
portrait poster is shown as a sharp key-art card over a blurred, darkened
backdrop; the home row cards use it as the 2:3 poster art.

| Show | File |
|---|---|
| The Jungle Crew | `jungle-crew.webp` |
| Tales of the Deep | `tales-of-the-deep.webp` |
| Little Scientists | `little-scientists.webp` |
| Space Rovers | `space-rovers.webp` |
| The Lost Kingdom | `the-lost-kingdom.webp` |
| Comedy Canvas | `comedy-canvas.webp` |
| Wonder Woods | `wonder-woods.webp` |
| Ocean Detectives | `ocean-detectives.webp` |

To regenerate, re-encode `img/*.jpg` to `600×780` webp (q85) under these
filenames. A missing file simply falls back to the episode artwork — nothing
breaks until the image is added.