# Guilt Calculator 🍕

> Your food, your consequences bestie — a loving guilt-trip widget for your Swiggy & Zomato checkout.

Guilt Calculator is a Chrome extension that estimates the calories of food items on **Swiggy** and **Zomato** and shows you a "guilt score" so you can make peace with your order (or not).

## Features

- Reads food item names on swiggy.com and zomato.com to estimate calories
- Shows a guilt score widget right on the page
- 100% local — all processing happens in your browser

## Privacy

No data is collected, stored, or transmitted anywhere. No personal information, cookies, tracking, or analytics. See [privacy-policy.html](privacy-policy.html) for details.

## Installation (Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Visit [swiggy.com](https://www.swiggy.com) or [zomato.com](https://www.zomato.com) and start browsing

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension configuration |
| `content.js` | Reads food items and computes guilt scores on Swiggy/Zomato pages |
| `popup.html` / `popup.js` | Extension popup UI |
| `styles.css` | Styling for the on-page widget |
| `icons/` | Extension icons |

## Contact

contact@revoralabs.in
