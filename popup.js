const transformations = [
  // { name: "Uppercase",      fn: s => s.toUpperCase() },
  // { name: "Lowercase",      fn: s => s.toLowerCase() },
  { name: "Fix UTF-8",      fn: s => fix(s, 'utf-8') },
  { name: "Fix GBK",        fn: s => fix(s, 'gbk') },
  { name: "Fix Big5",       fn: s => fix(s, 'big5') },
  { name: "Fix Shift-Jis",       fn: s => fix(s, 'shift-js') },
  { name: "Fix Euc-Kr",       fn: s => fix(s, 'enc-kr') },
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

// Get current selection + editable status
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: getSelectedTextAndContext
  }, (results) => {
    const data = results?.[0]?.result;
    if (!data || !data.text) {
      document.getElementById("options").innerHTML = "<i>No text selected or focused</i>";
      return;
    }
    renderOptions(data.text, data.isEditable);
  });
});

function getSelectedTextAndContext() {
  const selection = window.getSelection();
  let text = selection.toString().trim();
  let isEditable = false;

  // If nothing selected, fall back to focused input/textarea
  if (!text) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
      text = el.value || el.textContent || "";
      isEditable = true;
    }
  } else {
    // Check if selection is inside an editable element
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range) {
      const container = range.commonAncestorContainer;
      const node = container.nodeType === 1 ? container : container.parentNode;
      isEditable = node.isContentEditable ||
        (node.closest && (node.closest('input') || node.closest('textarea')));
    }
  }

  return { text: text.substring(0, 2000), isEditable };
}

function renderOptions(originalText, isEditable) {
  const container = document.getElementById("options");
  container.innerHTML = ""; // clear

  if (!isEditable) {
    const hint = document.createElement("div");
    hint.style.padding = "8px 12px";
    hint.style.background = "#fff8e1";
    hint.style.borderRadius = "6px";
    hint.style.marginBottom = "10px";
    hint.style.fontSize = "12px";
    hint.textContent = "Preview only (text is not editable)";
    container.appendChild(hint);
  }

  transformations.forEach((t) => {
    const transformed = t.fn(originalText) || "(empty)";
    const div = document.createElement("div");
    div.className = "option";
    if (!isEditable) div.style.opacity = "0.85";

    div.innerHTML = `
      <span class="label">${t.name}:</span>
      <span class="preview">${escapeHtml(transformed)}</span>
    `;

    if (isEditable) {
      div.style.cursor = "pointer";
      div.title = "Click to replace text";
      div.onclick = () => applyTransformation(transformed);
    } else {
      div.title = "Cannot replace non-editable text";
    }

    container.appendChild(div);
  });
}

function applyTransformation(newText) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: replaceSelectedOrFocusedText,
      args: [newText]
    });
    window.close();
  });
}

function replaceSelectedOrFocusedText(newText) {
  const el = document.activeElement;
  const isInput = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

  if (isInput) {
    if (el.value !== undefined) el.value = newText;
    else el.textContent = newText;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
