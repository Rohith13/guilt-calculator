// Guilt Calculator — content script
// Runs on swiggy.com & zomato.com checkout pages. Fully offline, no APIs.

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 1. CALORIE LOOKUP TABLE (keyword -> calories per unit)
  //    Matching is done via lowercase substring search on item names.
  //    Sorted by keyword length (desc) at match-time so more specific
  //    phrases (e.g. "paneer butter masala") win over generic ones
  //    (e.g. "paneer").
  // ---------------------------------------------------------------------
  const CALORIE_TABLE = {
    "butter chicken": 420,
    "chicken biryani": 650,
    "mutton biryani": 700,
    "veg biryani": 550,
    "biryani": 650,
    "paneer butter masala": 400,
    "paneer tikka": 350,
    "paneer": 300,
    "cheese burst pizza": 350,
    "pizza slice": 300,
    "pizza": 300,
    "samosa": 140,
    "chole bhature": 550,
    "chana masala": 250,
    "dosa": 200,
    "masala dosa": 250,
    "maggi": 350,
    "pasta": 400,
    "fried rice": 450,
    "noodles": 400,
    "hakka noodles": 420,
    "shawarma": 500,
    "cold coffee": 250,
    "brownie": 350,
    "gulab jamun": 150,
    "burger": 490,
    "cheese burger": 550,
    "veg burger": 420,
    "butter naan": 100,
    "garlic naan": 130,
    "naan": 90,
    "roti": 80,
    "tandoori roti": 90,
    "dal makhani": 280,
    "dal tadka": 180,
    "dal": 150,
    "chicken tikka": 250,
    "tandoori chicken": 300,
    "momos": 250,
    "momo": 250,
    "spring roll": 200,
    "french fries": 320,
    "fries": 320,
    "coca cola": 140,
    "pepsi": 150,
    "coke": 140,
    "lassi": 200,
    "ice cream": 250,
    "chicken roll": 350,
    "veg roll": 250,
    "kathi roll": 300,
    "idli": 150,
    "vada": 180,
    "uttapam": 250,
    "chicken wings": 350,
    "manchurian": 300,
    "buttermilk": 100,
    "cappuccino": 150,
    "coffee": 120,
    "tea": 80,
    "sandwich": 300,
    "club sandwich": 380,
    "wrap": 350,
    "salad": 150,
    "soup": 120,
    "chicken curry": 350,
    "mutton curry": 450,
    "egg curry": 250,
    "omelette": 200,
    "aloo paratha": 300,
    "paratha": 250,
    "chicken 65": 350,
    "chaat": 200,
    "pav bhaji": 400,
    "vada pav": 280,
    "misal pav": 350,
    "garlic bread": 300,
    "donut": 250,
    "milkshake": 350,
    "cupcake": 250,
    "waffle": 400,
    "pancake": 350,
    "kulfi": 150,
    "rasmalai": 200,
    "jalebi": 200,
    "kebab": 300,
    "seekh kebab": 320,
    "fried chicken": 450,
    "tacos": 280,
    "burrito": 450,
    "sushi": 300,
  };

  const DEFAULT_CALORIES = 380;
  const CALORIES_PER_GYM_DAY = 300;

  // Non-edible cart add-ons (cutlery, candles, cleaning stuff, etc.) should
  // never count toward the guilt total. Matched as a substring against the
  // lowercased item name.
  const NON_EDIBLE_KEYWORDS = [
    "tissue", "napkin", "wet wipe", "wipes", "cutlery", "spoon", "fork",
    "straw", "candle", "matchbox", "matches", "incense", "agarbatti",
    "diya", "disposable", "garbage bag", "trash bag", "dustbin bag",
    "detergent", "dishwash", "handwash", "hand wash", "soap", "sanitizer",
    "phenyl", "toilet cleaner", "floor cleaner", "mosquito", "repellent",
    "battery", "batteries", "bulb", "candle", "carry bag", "ziplock",
    "aluminium foil", "foil", "cling wrap", "trash", "air freshener",
    "shampoo", "toothpaste", "toothbrush", "razor", "diaper", "sanitary",
    "pooja", "puja", "rakhi", "gift wrap", "wrapping paper",
  ];

  function isEdibleItem(name) {
    const lower = name.toLowerCase();
    return !NON_EDIBLE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  // For items sold by weight/volume (tubs, bottles, packs), calories scale
  // with the printed size. Values are kcal per 100g / 100ml.
  const CALORIE_DENSITY_TABLE = {
    "ice cream": 185,
    "kulfi": 220,
    "milkshake": 110,
    "cold coffee": 60,
    "lassi": 90,
    "buttermilk": 40,
    "juice": 45,
    "cold drink": 42,
    "soda": 42,
    "cola": 42,
    "coke": 42,
    "pepsi": 42,
    "curd": 60,
    "yogurt": 60,
    "paneer": 265,
    "ghee": 900,
    "butter": 720,
    "chocolate": 535,
    "biscuit": 480,
    "cookie": 480,
    "chips": 540,
    "namkeen": 540,
  };

  // Pre-sort keywords by length (desc) so the most specific match wins.
  const SORTED_KEYWORDS = Object.keys(CALORIE_TABLE).sort(
    (a, b) => b.length - a.length
  );
  const SORTED_DENSITY_KEYWORDS = Object.keys(CALORIE_DENSITY_TABLE).sort(
    (a, b) => b.length - a.length
  );

  // Extracts a printed size like "500ml", "1 L", "250g", "1kg" and returns
  // its value normalized to "units of 100" (e.g. 500ml -> 5, 250g -> 2.5).
  function extractSizeIn100Units(name) {
    const match = name.match(/(\d+(?:\.\d+)?)\s*(ml|l|kg|gms?|grams?|g)\b/i);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    let grams;
    if (unit === "l") {
      grams = value * 1000;
    } else if (unit === "kg") {
      grams = value * 1000;
    } else {
      grams = value; // ml, g, gm, gms, gram(s) treated 1:1
    }

    return grams / 100;
  }

  // Portion-size words that should scale the base calorie value. The
  // CALORIE_TABLE values are calibrated to a "full"/regular single serving,
  // so other portion words are expressed relative to that.
  const PORTION_MULTIPLIERS = {
    "family pack": 2.5,
    "party pack": 2.5,
    "half": 0.6,
    "quarter": 0.35,
    "full": 1,
    "regular": 1,
    "jumbo": 1.3,
    "large": 1.3,
    "medium": 1,
    "small": 0.6,
    "mini": 0.6,
  };

  const SORTED_PORTION_KEYWORDS = Object.keys(PORTION_MULTIPLIERS).sort(
    (a, b) => b.length - a.length
  );

  function extractPortionMultiplier(name) {
    for (const keyword of SORTED_PORTION_KEYWORDS) {
      if (name.includes(keyword)) {
        return PORTION_MULTIPLIERS[keyword];
      }
    }
    return 1;
  }

  // Rough Indian-restaurant price-to-calorie ratio (₹ per calorie), used to
  // estimate extra calories from "Customize"-style add-ons that Swiggy/
  // Zomato don't expose as text (e.g. extra chicken pieces, add-on sides).
  // Calibrated against "Chicken Biryani Full" (~₹280 for ~650 cal -> ~0.43).
  const PRICE_PER_CALORIE_INR = 0.45;

  // If the per-unit price is notably higher than what we'd expect for the
  // matched dish, treat the difference as paid-for add-ons and convert it
  // back into extra calories.
  function applyPriceAdjustment(baseCalories, unitPrice) {
    if (!unitPrice) return { calories: baseCalories, adjusted: false };
    const expectedPrice = baseCalories * PRICE_PER_CALORIE_INR;
    // Require roughly a 2x markup before assuming hidden add-ons — premium/
    // dessert items routinely cost 1.2-1.5x the "expected" price without
    // any customization, so a small threshold causes false positives.
    if (unitPrice <= expectedPrice * 2) {
      return { calories: baseCalories, adjusted: false };
    }
    const extraCalories = (unitPrice - expectedPrice) / PRICE_PER_CALORIE_INR;
    return {
      calories: Math.round((baseCalories + extraCalories) / 5) * 5,
      adjusted: true,
    };
  }

  // Returns { calories, adjusted } — `adjusted` is true when the price
  // suggested paid-for add-ons that aren't visible as text (so the calorie
  // figure includes a rough estimate for them).
  function caloriesForItemName(rawName, unitPrice) {
    const name = rawName.toLowerCase();

    // If the item has a printed size (e.g. "500ml") and matches a known
    // density (e.g. ice cream), scale calories to that exact size. Size is
    // already a direct physical measure, so skip the price adjustment.
    const sizeUnits = extractSizeIn100Units(name);
    if (sizeUnits !== null) {
      for (const keyword of SORTED_DENSITY_KEYWORDS) {
        if (name.includes(keyword)) {
          const calories = CALORIE_DENSITY_TABLE[keyword] * sizeUnits;
          return { calories: Math.round(calories / 5) * 5, adjusted: false };
        }
      }
    }

    const portionMultiplier = extractPortionMultiplier(name);

    for (const keyword of SORTED_KEYWORDS) {
      if (name.includes(keyword)) {
        const base = Math.round((CALORIE_TABLE[keyword] * portionMultiplier) / 5) * 5;
        return applyPriceAdjustment(base, unitPrice);
      }
    }
    const base = Math.round((DEFAULT_CALORIES * portionMultiplier) / 5) * 5;
    return applyPriceAdjustment(base, unitPrice);
  }

  // ---------------------------------------------------------------------
  // 2. GUILT TIER SYSTEM
  // ---------------------------------------------------------------------
  const TIERS = [
    {
      max: 400,
      emoji: "😇",
      title: "Ate like a saint",
      line: "okay bestie you're actually winning",
    },
    {
      max: 700,
      emoji: "😏",
      title: "Soft launch",
      line: "not bad, not great, very mid honestly",
    },
    {
      max: 1100,
      emoji: "🍽️",
      title: "Main character energy",
      line: "you really said treat yourself huh",
    },
    {
      max: 1500,
      emoji: "🤤",
      title: "No thoughts, just food",
      line: "the gym can wait bestie",
    },
    {
      max: 2000,
      emoji: "💀",
      title: "Delulu era",
      line: "this is not a meal this is a lifestyle choice",
    },
    {
      max: Infinity,
      emoji: "🔥",
      title: "Unhinged. Iconic. Fed.",
      line: "no notes. absolute legend behavior.",
    },
  ];

  function getTier(totalCalories) {
    return TIERS.find((tier) => totalCalories < tier.max) || TIERS[TIERS.length - 1];
  }

  // ---------------------------------------------------------------------
  // 3. SITE DETECTION
  // ---------------------------------------------------------------------
  const HOST = window.location.hostname;
  const IS_SWIGGY = HOST.includes("swiggy.com");
  const IS_ZOMATO = HOST.includes("zomato.com");

  // ---------------------------------------------------------------------
  // 4. PLACE-ORDER BUTTON DETECTION
  // ---------------------------------------------------------------------
  const BUTTON_TEXT_PATTERNS = [
    /place order/i,
    /proceed to pay/i,
    /proceed to checkout/i,
    /pay now/i,
    /continue to pay/i,
    /make payment/i,
  ];

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findPlaceOrderButton() {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a[role="button"], div[role="button"], a, div, span'
      )
    );

    const matches = candidates.filter((el) => {
      const text = (el.textContent || "").trim();
      if (!text || text.length > 40) return false;
      if (!isVisible(el)) return false;
      return BUTTON_TEXT_PATTERNS.some((pattern) => pattern.test(text));
    });

    if (matches.length === 0) return null;

    // Prefer the innermost matching element (e.g. the <button> itself
    // rather than a large wrapper <div> that also contains the text).
    const leafMatches = matches.filter(
      (el) => !matches.some((other) => other !== el && el.contains(other))
    );

    return leafMatches[0] || matches[0];
  }

  // ---------------------------------------------------------------------
  // 5. CART ITEM EXTRACTION
  // ---------------------------------------------------------------------

  // Selector lists — Swiggy & Zomato change class names often, so we try
  // a wide net of fallbacks. Selectors that match nothing are harmless.
  const ITEM_NAME_SELECTORS = [
    // Generic data attributes
    '[data-testid="item-name"]',
    '[data-testid*="item-name" i]',
    '[data-testid*="product-name" i]',

    // Swiggy-ish
    'div[class*="ItemName" i]',
    'div[class*="itemName" i]',
    'span[class*="itemName" i]',
    'div[class*="cartItem" i] div[class*="name" i]',
    'div[class*="CartItem" i] div[class*="name" i]',
    'div[class*="cart-item" i] [class*="name" i]',

    // Zomato-ish
    'h4[class*="sc-"][class*="name" i]',
    'div[class*="cart" i] h4',
    'div[class*="CartItem" i] h4',
    'p[class*="itemName" i]',
    'div[class*="order" i] [class*="item" i] [class*="name" i]',
  ];

  // Things that look like quantity badges near an item name
  const QTY_SELECTORS = [
    '[class*="qty" i]',
    '[class*="quantity" i]',
    '[class*="count" i]',
    '[data-testid*="qty" i]',
    '[data-testid*="quantity" i]',
  ];

  function parseQtyFromText(text) {
    if (!text) return null;
    const trimmed = text.trim();
    // "2 x", "x 2", "2X", "X2", or just a lone number like "2"
    let m = trimmed.match(/^\s*(\d{1,2})\s*[xX]\s*$/);
    if (m) return parseInt(m[1], 10);
    m = trimmed.match(/^\s*[xX]\s*(\d{1,2})\s*$/);
    if (m) return parseInt(m[1], 10);
    m = trimmed.match(/^\s*(\d{1,2})\s*$/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  function findQuantityNear(nameEl) {
    // Search up to 3 ancestor levels for a quantity-ish element/text
    let node = nameEl;
    for (let depth = 0; depth < 4 && node; depth++) {
      const container = node.parentElement;
      if (!container) break;

      for (const sel of QTY_SELECTORS) {
        const qtyEl = container.querySelector(sel);
        if (qtyEl && qtyEl !== nameEl) {
          const qty = parseQtyFromText(qtyEl.textContent);
          if (qty) return qty;
        }
      }

      // Also check direct text siblings for "N x" style markers
      for (const sibling of container.children) {
        if (sibling === nameEl) continue;
        const qty = parseQtyFromText(sibling.textContent);
        if (qty) return qty;
      }

      node = container;
    }
    return 1; // default quantity
  }

  function cleanItemName(text) {
    return text
      .replace(/₹\s*[\d,]+(\.\d+)?/g, "") // strip prices
      .replace(/\s*[xX]\s*\d+\s*$/, "") // strip trailing "x2"
      .replace(/^\s*\d+\s*[xX]\s*/, "") // strip leading "2x"
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractViaSelectors() {
    const items = [];
    const seen = new Set();

    for (const selector of ITEM_NAME_SELECTORS) {
      let nodes;
      try {
        nodes = document.querySelectorAll(selector);
      } catch (e) {
        continue;
      }

      nodes.forEach((el) => {
        if (!isVisible(el)) return;
        const rawText = (el.textContent || "").trim();
        const name = cleanItemName(rawText);

        if (!name || name.length < 3 || name.length > 60) return;
        // Filter out obvious non-item rows
        if (/^(total|subtotal|tax|gst|delivery|fee|discount|coupon|tip|charges?|item total|to pay|grand total)/i.test(name)) {
          return;
        }
        if (seen.has(name.toLowerCase())) return;

        const qty = findQuantityNear(el);
        seen.add(name.toLowerCase());
        items.push({ name, qty });
      });
    }

    return items;
  }

  // Fallback: scan the text around the place-order button line-by-line
  // looking for "<qty> x <name>" style rows or known food keywords.
  function extractViaTextScan(button) {
    if (!button) return [];

    let container = button;
    for (let i = 0; i < 8 && container.parentElement; i++) {
      container = container.parentElement;
      if ((container.innerText || "").length > 150) break;
    }

    const text = container.innerText || "";
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const items = [];
    const seen = new Set();

    for (const line of lines) {
      if (line.length > 60) continue;
      if (/^(total|subtotal|tax|gst|delivery|fee|discount|coupon|tip|charges?|item total|to pay|grand total|₹)/i.test(line)) {
        continue;
      }

      // "2 X Butter Chicken" or "Butter Chicken x2"
      let m = line.match(/^(\d{1,2})\s*[xX]\s+(.{3,50})$/);
      if (m) {
        const name = cleanItemName(m[2]);
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          items.push({ name, qty: parseInt(m[1], 10) });
        }
        continue;
      }

      m = line.match(/^(.{3,50})\s*[xX]\s*(\d{1,2})$/);
      if (m) {
        const name = cleanItemName(m[1]);
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          items.push({ name, qty: parseInt(m[2], 10) });
        }
        continue;
      }

      // Plain line that contains a known food keyword -> assume qty 1
      const lower = line.toLowerCase();
      for (const keyword of SORTED_KEYWORDS) {
        if (lower.includes(keyword)) {
          const name = cleanItemName(line);
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            items.push({ name, qty: 1 });
          }
          break;
        }
      }
    }

    return items;
  }

  // Lines that are part of the bill summary / page chrome, never item names.
  const NON_ITEM_LINE = new RegExp(
    [
      "^total",
      "^subtotal",
      "^item total",
      "^tax",
      "^gst",
      "^delivery",
      "^platform fee",
      "^packing",
      "^restaurant",
      "^convenience",
      "^donation",
      "^fee",
      "^discount",
      "^coupon",
      "^tip",
      "^charges?",
      "^to pay",
      "^grand total",
      "^savings?",
      "^you save",
      "^free$",
      "^secure checkout",
      "^choose ",
      "^delivery address",
      "^payment method",
      "^change$",
      "^deliver here",
      "^add new",
      "^any suggestions",
      "^opt in",
      "^no-?contact",
      "^review your order",
      "^note:",
      "^read policy",
      "^help$",
      "^mins?$",
      "^customi[sz]e",
      "^add on",
      "^addons?",
    ].join("|"),
    "i"
  );

  // Strip a leading "₹" from a line so bare-number checks work whether or
  // not the currency symbol is present.
  function stripCurrency(line) {
    return line.replace(/^₹\s*/, "").trim();
  }

  const QTY_LINE = /^\d{1,2}$/; // e.g. "1", "2"
  const PRICE_LINE = /^\d{1,5}(\.\d{1,2})?(\s*FREE)?$/i; // e.g. "455", "40.33", "24.00FREE"
  const STEPPER_MARKER = /^[-−+]$/; // "-", "−" or "+"

  // Once we hit any of these, we've left the cart item list — everything
  // after is bill summary or "recommended for you" carousels that look
  // structurally similar (name, weight, price) and would otherwise be
  // mistaken for cart items.
  const SECTION_END_MARKERS = new RegExp(
    [
      "^bill details",
      "^item total",
      "^apply coupon",
      "^add more items",
      "^savings corner",
      "^did you forget",
      "^you might also like",
      "^frequently bought",
      "^complete your meal",
      "^for hair",
      "^biscuits and cakes",
      "^add gstin",
      "^view detailed bill",
    ].join("|"),
    "i"
  );

  // Main heuristic: walk the page's text line-by-line, scoped to the cart
  // item list. Real Swiggy/Zomato checkout & Instamart pages render each
  // item as a name line followed by an optional "+"/"-" stepper, a
  // quantity (1-2 digits), then a bare price number — e.g.
  // "Salankatiya Pistachio Lotus", "+", "1", "455".
  function extractViaPriceAnchors() {
    const text = document.body.innerText || "";
    const allLines = text
      .split("\n")
      .map((l) => stripCurrency(l))
      .filter(Boolean);

    let endIndex = allLines.length;
    for (let i = 0; i < allLines.length; i++) {
      if (SECTION_END_MARKERS.test(allLines[i])) {
        endIndex = i;
        break;
      }
    }
    const lines = allLines.slice(0, endIndex);

    const items = [];
    const seen = new Set();

    // Lines like "90 g", "500ml", "1 kg", "1 pack" are size/unit labels,
    // not item names — exclude them so they aren't treated as items.
    const SIZE_ONLY_LINE = /^\d+(\.\d+)?\s*(ml|l|kg|gm|gms|grams?|g|packs?)$/i;

    const isNameCandidate = (line) =>
      line.length >= 3 &&
      line.length <= 60 &&
      /[a-zA-Z]/.test(line) &&
      !NON_ITEM_LINE.test(line) &&
      !SIZE_ONLY_LINE.test(line) &&
      !/^[-−+\d\s.,]+$/.test(line);

    const addItem = (rawName, qty, price) => {
      const name = cleanItemName(rawName);
      if (!name || !isNameCandidate(name)) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ name, qty: qty || 1, price: price || null });
    };

    const MAX_LOOKAHEAD = 6;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isNameCandidate(line)) continue;

      // If the very next line is a size label (e.g. "90 g"), fold it into
      // the name so calorie lookup can use it (e.g. density-based scaling
      // for chocolate/ice cream/etc).
      const sizeSuffix = SIZE_ONLY_LINE.test(lines[i + 1]) ? " " + lines[i + 1] : "";

      // Look ahead for a quantity digit (possibly past a size label and/or
      // "+"/"-" steppers), then a price shortly after it. Bail out if we
      // hit another item-name-like line first — that means *this* line
      // isn't actually an item row.
      let matched = false;
      for (let k = i + 1; k < lines.length && k <= i + MAX_LOOKAHEAD; k++) {
        if (QTY_LINE.test(lines[k])) {
          let m = k + 1;
          while (m < lines.length && STEPPER_MARKER.test(lines[m]) && m <= k + 2) {
            m++;
          }

          if (m < lines.length && PRICE_LINE.test(lines[m]) && m <= k + 2) {
            addItem(line + sizeSuffix, parseInt(lines[k], 10), parseFloat(lines[m]));
            i = m;
            matched = true;
          }
          break;
        }

        if (isNameCandidate(lines[k])) break;
      }
      if (matched) continue;

      // Pattern: name -> price (no quantity shown, assume 1).
      if (PRICE_LINE.test(lines[i + 1]) && !QTY_LINE.test(lines[i + 1])) {
        addItem(line, 1, parseFloat(lines[i + 1]));
        i = i + 1;
      }
    }

    return items;
  }

  function extractCartItems(button) {
    const viaPriceAnchors = extractViaPriceAnchors();
    if (viaPriceAnchors.length > 0) return viaPriceAnchors;

    const viaSelectors = extractViaSelectors();
    if (viaSelectors.length > 0) return viaSelectors;

    return extractViaTextScan(button);
  }

  // ---------------------------------------------------------------------
  // 6. WIDGET RENDERING
  // ---------------------------------------------------------------------
  const WIDGET_ID = "sgs-guilt-widget";

  function buildWidget(totalCalories, gymDays, tier, nonEdibleNote) {
    const widget = document.createElement("div");
    widget.id = WIDGET_ID;
    widget.className = "sgs-widget";

    widget.innerHTML = `
      <div class="sgs-header">
        <span class="sgs-emoji">${tier.emoji}</span>
        <span class="sgs-title">${tier.title}</span>
      </div>
      <div class="sgs-line">${tier.line}</div>
      <div class="sgs-stats">
        🔥 ${totalCalories} calories &nbsp;•&nbsp; 🏋️ ${gymDays} gym day${gymDays === 1 ? "" : "s"} to undo this
      </div>
      ${nonEdibleNote ? `<div class="sgs-line">${nonEdibleNote}</div>` : ""}
      <div class="sgs-footer">no judgment tho. you deserve it 💅</div>
      <div class="sgs-watermark">powered by <a href="https://www.revoralabs.in" target="_blank" rel="noopener noreferrer" class="sgs-watermark-link">Revora Labs</a></div>
    `;

    return widget;
  }

  function injectWidget(totalCalories, gymDays, tier, nonEdibleNote) {
    const existing = document.getElementById(WIDGET_ID);
    if (existing) {
      existing.remove();
    }

    // Float as a fixed card in the corner instead of inserting into the
    // page layout — checkout bottom-bars are often height-constrained
    // (e.g. Instamart's sticky cart bar) and would clip an inline widget.
    const widget = buildWidget(totalCalories, gymDays, tier, nonEdibleNote);
    document.body.appendChild(widget);

    // restart slide-in animation
    requestAnimationFrame(() => {
      widget.classList.add("sgs-visible");
    });
  }

  // ---------------------------------------------------------------------
  // 7. MAIN UPDATE LOOP
  // ---------------------------------------------------------------------
  let lastSignature = "";

  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log("[Guilt Score]", ...args);
  }

  function update() {
    if (!IS_SWIGGY && !IS_ZOMATO) return;

    const button = findPlaceOrderButton();
    if (!button) {
      log("no place-order/proceed-to-pay button found yet");
      return;
    }
    log("found button:", button.textContent.trim(), button);

    const items = extractCartItems(button);
    if (items.length === 0) {
      log("no cart items detected");
      return;
    }
    log("detected items:", items);

    let totalCalories = 0;
    const nonEdibleItems = [];
    let hasAdjustedItem = false;
    for (const item of items) {
      const qty = Math.max(1, item.qty || 1);
      if (!isEdibleItem(item.name)) {
        nonEdibleItems.push(item.name);
        continue;
      }
      const unitPrice = item.price ? item.price / qty : null;
      const { calories, adjusted } = caloriesForItemName(item.name, unitPrice);
      if (adjusted) hasAdjustedItem = true;
      totalCalories += calories * qty;
    }

    const signature = JSON.stringify(items) + "|" + totalCalories;
    if (signature === lastSignature && document.getElementById(WIDGET_ID)) {
      return; // nothing changed, widget already present
    }
    lastSignature = signature;

    const gymDays = Math.max(1, Math.ceil(totalCalories / CALORIES_PER_GYM_DAY));
    const tier = getTier(totalCalories);

    let nonEdibleNote = "";
    if (nonEdibleItems.length === 1) {
      nonEdibleNote = `relax, the ${nonEdibleItems[0].toLowerCase()} doesn't count towards your guilt 😌`;
    } else if (nonEdibleItems.length > 1) {
      nonEdibleNote = `your ${nonEdibleItems.length} non-food extras are guilt-free, don't worry 😌`;
    } else if (hasAdjustedItem) {
      nonEdibleNote = `psst, some add-ons aren't shown by Guilt Calculator, this includes a rough estimate for those 👀`;
    }

    log(`total ${totalCalories} cal, ${gymDays} gym days, tier: ${tier.title}`, "non-edible:", nonEdibleItems, "adjusted:", hasAdjustedItem);
    injectWidget(totalCalories, gymDays, tier, nonEdibleNote);
  }

  // ---------------------------------------------------------------------
  // 8. OBSERVE DOM CHANGES (cart loads dynamically on both sites)
  // ---------------------------------------------------------------------
  const observer = new MutationObserver(() => {
    clearTimeout(window.__sgsDebounce);
    window.__sgsDebounce = setTimeout(update, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run + a couple of delayed retries for slow SPA loads
  update();
  setTimeout(update, 1000);
  setTimeout(update, 3000);
})();
