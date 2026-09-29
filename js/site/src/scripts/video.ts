// Swap the play button for the YouTube iframe on click (no request before that).
for (const box of document.querySelectorAll<HTMLElement>("[data-video]")) {
  box.querySelector("button")?.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = box.dataset.video ?? "";
    frame.title = box.dataset.videoTitle ?? "";
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.className = "size-full border-0";
    box.replaceChildren(frame);
  });
}
