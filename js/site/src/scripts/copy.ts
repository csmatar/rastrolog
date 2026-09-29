// Copy buttons: put data-copy on the clipboard and say "Copied" for two seconds.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  const label = button.textContent ?? "";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? "");
    } catch {
      return; // clipboard blocked: leave the button as it was
    }
    button.textContent = button.dataset.copiedLabel ?? label;
    button.dataset.copied = "";
    window.setTimeout(() => {
      button.textContent = label;
      delete button.dataset.copied;
    }, 2000);
  });
}
