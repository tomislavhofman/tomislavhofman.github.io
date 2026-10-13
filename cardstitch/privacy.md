---
layout: cardstitch-legal
title: CardStitch Privacy Policy
heading: Privacy policy
description: "How the CardStitch app for Android and iOS handles your data: everything runs on your device, with no account, no analytics and nothing uploaded."
permalink: /cardstitch/privacy/
cardstitch: true
legal: true
effective_date: 2026-10-13
share_image: /cardstitch/share.png
share_image_alt: "CardStitch: one photo, both sides."
---

**What changed on October 13, 2026:** this policy now also covers the iOS
(iPhone) version of CardStitch, including how it uses Apple's Vision
framework, the Photos app and the Files app. We also added sections on the
diagnostics log and Google Play in-app updates. The previous version was
effective September 24, 2026.
{: .legal__note}

CardStitch is an app for Android and iOS developed and maintained by
**Tomislav Hofman**. This policy explains what CardStitch accesses and what
happens to that information.

## The Short Version

CardStitch is designed to work locally on your device. It has no CardStitch
account, developer-operated server, analytics, advertising system, or cloud
gallery. CardStitch does not collect your data or send it to Tomislav Hofman,
and we do not sell your data.

## Information CardStitch Uses

### Camera and card images

CardStitch asks for camera access because capturing card images is its core
function. The camera is used only to photograph your cards while you are using
the camera screen. Captured images are processed on the device to detect card
edges, crop the cards, stitch the front and back together, and recognize text
for a filename.

Where the resulting images are saved depends on your device:

- **Android:** in the device's shared Pictures/CardStitch folder, using
  Android MediaStore.
- **iOS:** in CardStitch's own folder in the Files app (On My iPhone ›
  CardStitch). A copy of each stitched image is also saved to your photo
  library in the Photos app.

CardStitch does not upload the captured images or recognized text to a
CardStitch server.

### Card detection and text recognition

Card detection uses LiteRT machine learning models that are bundled with the
app and run on the device, on both Android and iOS.

On **Android**, CardStitch uses Google's bundled ML Kit text recognition
library for on-device OCR. The card image input and OCR result are processed
on the device. The ML Kit Android SDK may collect limited device, app,
performance, and usage information for its own diagnostics and analytics, as
described in Google's
[ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure).
CardStitch does not receive or control that SDK diagnostic data.

On **iOS**, CardStitch uses Apple's Vision framework, which is part of iOS,
to recognize text on the device. The iOS app includes no third-party
analytics or advertising SDKs.

### Photos access (iOS)

On iOS, CardStitch asks only for permission to add photos to your photo
library, so it can save a copy of each stitched card image there. This
add-only permission does not let CardStitch see, read, or change any other
photos, and CardStitch does not create albums. If you do not allow it, your
cards are still saved in CardStitch's folder in the Files app.

### Local settings

CardStitch stores settings on the device, such as onboarding status, haptic
feedback, gallery layout, and filename preferences. These settings are not
sent to Tomislav Hofman. On Android, they may be included in your device's
own backup if you have Android backup turned on.

### Diagnostics log

To help troubleshoot problems, CardStitch keeps a short technical log on the
device, for example processing times, errors, and the card names and
filenames it recognized. You can view and clear this log in the app's
settings. It stays on your device and is never sent automatically. It only
leaves the device if you tap Share log and choose where to send it, for
example to email it to us when reporting a problem.

### Sharing

When you choose Share, Android or iOS passes the selected image to the app you
choose. That transfer is started by you and is controlled by the receiving
app's privacy policy and terms.

### App updates (Android)

When CardStitch is installed from Google Play, it uses Google Play's in-app
update feature to check whether a newer version is available and, if there
is one, to install it. That check is handled by Google Play on your device
under Google's terms. CardStitch does not send information to Tomislav Hofman
as part of it.

## Storage, Retention, and Deletion

**Android:** card images remain in the device's Pictures/CardStitch folder
until you delete them in CardStitch or with an Android file or gallery app.
Deleting a card in CardStitch removes the image files that CardStitch knows
about. Uninstalling CardStitch may not remove images that were saved to shared
Android storage. You can delete those images using the device's gallery or
file manager.

**iOS:** card images remain in CardStitch's folder in the Files app until you
delete them in CardStitch or in the Files app. Deleting a card in CardStitch
removes its files from that folder, but not the copy saved to your photo
library. That copy is yours to keep or delete in the Photos app, and it
also stays there if you delete the app.

You are responsible for copies you export or share to other apps.

## Permissions

On **Android**, CardStitch requests camera access for capture. On older
Android versions it may also request storage access so it can save the images
to the shared Pictures folder.

On **iOS**, CardStitch requests camera access for capture and add-only
Photos access to save a copy of each stitched image to your photo library, as
described above.

CardStitch does not request location, contacts, microphone, or account
permissions.

## Children

CardStitch does not knowingly collect personal information from children. It
does not provide accounts, messaging, advertising, or social features.

## Changes and Contact

This policy may be updated when CardStitch's data practices change. The current
version will be published on this page, with a short note on what changed.

Questions about this policy can be sent to
[contact@hofman.tech](mailto:contact@hofman.tech).

See also the [Terms of Use]({{ '/cardstitch/terms/' | relative_url }}).
