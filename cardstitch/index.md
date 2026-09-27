---
layout: default
title: CardStitch
permalink: /cardstitch/
cardstitch: true
---

# CardStitch

CardStitch is a simple Android app for capturing both sides of a trading card,
cropping the card edges, stitching the images together, and saving the result
to your device.

## Designed To Stay Local

CardStitch does not require an account and does not provide a cloud gallery.
Images and OCR input are processed on the device and saved to the device's
Pictures/CardStitch folder. Sharing only happens when you explicitly choose an
Android sharing destination.

The app is developed and maintained by **Tomislav Hofman**.

## Roadmap

Goals, not promises. No dates.

### Shipped

- Front and back capture
- Automatic card detection and cropping
- Front and back stitched into one image
- On-device text recognition for filenames
- Configurable filename format (name, number, date)
- Gallery: rename, delete, share
- Offline, no account

### In Progress

- Retrain card detection on more card games (currently best on Pokémon)

### Planned

- Read the card name and set number from their own areas instead of the whole card, for more reliable filenames
- Export and back up to a folder you choose

## More Information

- [Privacy policy]({{ '/cardstitch/privacy/' | relative_url }})
- [Terms of use]({{ '/cardstitch/terms/' | relative_url }})

Questions or feedback: [contact@hofman.tech](mailto:contact@hofman.tech).
