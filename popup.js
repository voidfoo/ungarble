function replaceSelectedOrFocusedText(newText) {
  // If there's an active selection in the page, replace it
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed) {
    try {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      // Move caret after inserted node
      sel.removeAllRanges();
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.collapse(true);
      sel.addRange(afterRange);
      return;
    } catch (e) {
      // fall through to input handling
    }
  }

  const el = document.activeElement;
  if (!el) return;

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = before + newText + after;
    const cursorPos = before.length + newText.length;
    try { el.setSelectionRange(cursorPos, cursorPos); } catch (e) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (el.isContentEditable) {
    // Best-effort: replace entire contentEditable if no selection, otherwise it was handled above
    el.textContent = newText;
  }
}
