const transformations = [
  // { name: "Uppercase",      fn: s => s.toUpperCase() },
  // { name: "Lowercase",      fn: s => s.toLowerCase() },
  { name: "Fix UTF-8",      fn: s => fix(s, 'utf-8') },
  { name: "Fix GBK",        fn: s => fix(s, 'gbk') },
  { name: "Fix Big5",       fn: s => fix(s, 'big5') },
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
