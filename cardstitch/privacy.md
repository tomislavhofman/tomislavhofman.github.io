---
layout: legal
title: CardStitch Privacy Policy
permalink: /cardstitch/privacy/
---

**Effective date:** September 24, 2026

CardStitch is an Android app by **Tomislav Hofman**. This policy explains what
CardStitch accesses and what happens to that information.

## The Short Version

CardStitch is designed to work locally on your device. It has no CardStitch
account, developer-operated server, advertising system, or cloud gallery. We do
not sell your data.

## Information CardStitch Uses

### Camera and card images

CardStitch asks for camera access because capturing card images is its core
function. The camera is used while you are using the camera screen. Captured
images are processed on the device to detect card edges, crop the cards, stitch
the front and back together, and recognize text for a filename.

The resulting images are saved to the device's shared Pictures/CardStitch
folder using Android MediaStore. CardStitch does not upload the captured images
or OCR text to a CardStitch server.

### OCR and machine learning

CardStitch uses LiteRT for card detection and Google's bundled ML Kit text
recognition library for on-device OCR. The card image input and OCR result are
processed on the device. The ML Kit Android SDK may collect limited device,
app, performance, and usage information for its own diagnostics and analytics,
as described in Google's [ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure).
CardStitch does not receive or control that SDK diagnostic data.

### Local settings

CardStitch stores settings on the device, such as onboarding status, haptic
feedback, gallery layout, and filename preferences. These settings are not
sent to Tomislav Hofman.

### Sharing

When you choose Share, Android passes the selected image to the app you choose.
That transfer is started by you and is controlled by the receiving app's
privacy policy and terms.

## Storage, Retention, and Deletion

Card images remain in the device's Pictures/CardStitch folder until you delete
them in CardStitch or with an Android file or gallery app. Deleting a card in
CardStitch removes the image files that CardStitch knows about. You are
responsible for copies you export or share to other apps.

Uninstalling CardStitch may not remove images that were saved to shared Android
storage. You can delete those images using the device's gallery or file
manager.

## Permissions

CardStitch requests camera access for capture. On older Android versions it may
also request storage access so it can save the images to the shared Pictures
folder. CardStitch does not request location, contacts, microphone, or account
permissions.

## Children

CardStitch does not knowingly collect personal information from children. It
does not provide accounts, messaging, advertising, or social features.

## Changes and Contact

This policy may be updated when CardStitch's data practices change. The current
version will be published on this page.

Questions about this policy can be sent to
[tomislav@hofman.tech](mailto:tomislav@hofman.tech).

[Terms of Use]({{ '/cardstitch/terms/' | relative_url }})
