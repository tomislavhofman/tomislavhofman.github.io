---
layout: default
title: CardStitch
permalink: /cardstitch/
cardstitch: true
---

<h1 class="visually-hidden">CardStitch</h1>

<div class="hero">
  <img src="{{ '/cardstitch/feature.png' | relative_url }}" alt="CardStitch — scan both sides of a trading card and save them as one clean image">
</div>

CardStitch captures both sides of a trading card, crops the card edges, stitches
them into one image and saves it to your device. On-device, no account.

## Roadmap

<ul class="roadmap">
  <li class="done">Front and back capture</li>
  <li class="done">Automatic card detection and cropping</li>
  <li class="done">Front and back stitched into one image</li>
  <li class="done">On-device text recognition for filenames</li>
  <li class="done">Configurable filename format (name, number, date)</li>
  <li class="done">Gallery: rename, delete, share</li>
  <li class="done">Offline, no account</li>
  <li>Improve card detection for different TCGs.</li>
  <li>Read the card name and set number from their own areas for more reliable filenames</li>
  <li class="done">Export</li>
</ul>

## Designed To Stay Local

CardStitch does not require an account and does not provide a cloud gallery.
Images and OCR input are processed on the device and saved to the device's
Pictures/CardStitch folder. Sharing only happens when you explicitly choose an
Android sharing destination.

## More Information

- [Privacy policy]({{ '/cardstitch/privacy/' | relative_url }})
- [Terms of use]({{ '/cardstitch/terms/' | relative_url }})

Questions or feedback: [contact@hofman.tech](mailto:contact@hofman.tech).

<p class="caption">Built and maintained by Tomislav Hofman.</p>
