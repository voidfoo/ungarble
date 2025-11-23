const transformations = [
  // { name: "Uppercase",      fn: s => s.toUpperCase() },
  // { name: "Lowercase",      fn: s => s.toLowerCase() },
  // { name: "Fix UTF-8",      fn: s => fixMojibake(s, 'utf-8') },
  // { name: "Fix GBK",        fn: s => fixMojibake(s, 'gbk') },
  // { name: "Fix Big5",       fn: s => fixMojibake(s, 'big5') },
  // { name: "Fix GB18030",    fn: s => fixMojibake(s, 'gb18030') },
  { name: "Fix UTF-8",      fn: s => fix(s, 'utf-8') },
  { name: "Fix GBK",        fn: s => fix(s, 'gbk') },
  { name: "Fix Big5",       fn: s => fix(s, 'big5') },
  // { name: "Fix GB18030",    fn: s => fix(s, 'gb18030') },
  // { name: "Reverse",        fn: s => s.split('').reverse().join('') },
  // Add more here easily!
];

function fix(str, encoding) {
  try {
    const latin1Bytes = Array.from(str).map(c => c.charCodeAt(0));
    const utf8String = new TextDecoder(encoding).decode(new Uint8Array(latin1Bytes));
    return utf8String;
  } catch (e) {
    return "Error decoding";
  }
}

const fixMojibake = (str, encoding) =>
      new TextDecoder(encoding, { fatal: false }).decode(
        new TextEncoder().encode(
          new TextDecoder('windows-1252').decode(
            new Uint8Array([...str].map(c => c.charCodeAt(0)))
          )
        )
      );

/**
 * fixMojibake - Automatically detects and fixes common mojibake in browser JavaScript
 * @param {string} str - The garbled string
  * @param {string} encoding - The target encoding to attempt to fix to (e.g., 'utf-8', 'gbk', etc.)
 * @returns {string} - The corrected string (or original if no fix found)
 */
function fixCommonMojibake(str, encoding) {
  if (typeof str !== 'string' || str.length === 0) return str;

  // Common replacement character patterns that indicate mojibake
  const hasReplacementChar = /�/g.test(str);
  const hasCommonMojibakePatterns = /[Ã|Â|Å|Ä|Æ|Ø|¡|¢|£|¤|¥|¦|§|¨|©|ª|«|¬|­|®|¯|°|±|²|³|´|µ|¶|·|¸|¹|º|»|¼|½|¾|¿]/.test(str);

  // Heuristic: long runs of Latin-1 supplement chars (common in UTF-8 → cp1252 mojibake)
  const hasLatin1Supplement = /[\u0080-\u00ff]/.test(str);
  const highDensity = (str.match(/[\u0080-\u00ff]/g) || []).length / str.length > 0.3;

  // 1. Try fixing "UTF-8 bytes read as Windows-1252" → this is BY FAR the most common
  if ((hasReplacementChar || hasCommonMojibakePatterns || (hasLatin1Supplement && highDensity))) {
    try {
      // Convert the string to binary as if it were Windows-1252/latin1
      const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)));
      const decoder = new TextDecoder('windows-1252');
      const utf8Bytes = decoder.decode(bytes);
      const fixed = new TextDecoder(encoding, { fatal: true }).decode(
        new TextEncoder().encode(utf8Bytes)
      );
      // If decoding succeeded and result looks reasonable (contains CJK, Cyrillic, etc.)
      if (/[\u4e00-\u9fff\u3040-\u30ff\u1100-\u11ff\uac00-\ud7af\u0400-\u04ff]/.test(fixed) ||
          (fixed.length < str.length * 0.8 && !/�/.test(fixed))) {
        return fixed;
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Try fixing "Windows-1252 bytes read as UTF-8" (less common but still happens)
  try {
    const encoder = new TextEncoder();
    const cp1252Bytes = encoder.encode(str);
    const fixed = new TextDecoder('windows-1252').decode(cp1252Bytes);
    if (/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/.test(fixed)) {
      return fixed; // Contains smart quotes, en/em dash, euro sign → likely correct
    }
  } catch (e) {}

  // 3. Try common East Asian encodings (Shift-JIS, GBK, EUC-KR) misinterpreted as cp1252
  const eastAsianAttempts = [
    { encoding: 'shift-jis', test: /[\u3040-\u30ff\u31f0-\u31ff]/ },  // Hiragana/Katakana
    { encoding: 'gbk',       test: /[\u4e00-\u9fff]/ },             // Chinese
    { encoding: 'euc-kr',    test: /[\uac00-\ud7af]/ }              // Korean Hangul
  ];

  for (const { encoding, test } of eastAsianAttempts) {
    try {
      const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0) & 0xff));
      const fixed = new TextDecoder(encoding).decode(bytes);
      if (test.test(fixed) && !/�/.test(fixed)) {
        return fixed;
      }
    } catch (e) {}
  }

  // If nothing worked, return original
  return str;
}

// Ask the page for the currently focused text
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: () => {
      const el = document.activeElement;
      if (!el) return null;
      return (el.value ?? el.textContent ?? "").substring(0, 1000); // limit size
    }
  }, (results) => {
    const text = results?.[0]?.result || "";
    if (!text) {
      document.getElementById("options").innerHTML = "<i>No text field focused</i>";
      return;
    }
    renderOptions(text);
  });
});

function renderOptions(originalText) {
  const container = document.getElementById("options");

  transformations.forEach((t, _) => {
    const transformed = t.fn(originalText);
    const div = document.createElement("div");
    div.className = "option";
    div.innerHTML = `
      <span class="label">${t.name}:</span>
      <span class="preview">${escapeHtml(transformed) || "(empty)"}</span>
    `;

    div.onclick = () => {
      // Apply chosen transformation
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: applyText,
          args: [transformed]
        });
      });
      // Visual feedback
      document.querySelectorAll(".option").forEach(d => d.classList.remove("selected"));
      div.classList.add("selected");
      setTimeout(() => window.close(), 300);
    };

    container.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function applyText(newText) {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
    if (el.value !== undefined) el.value = newText;
    else el.textContent = newText;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
