(() => {
  const images = Array.from(document.querySelectorAll("main.page img")).filter(
    (img) => !img.dataset.noLightbox
  );

  if (!images.length) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";

  const dialog = document.createElement("div");
  dialog.className = "lightbox-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "lightbox-close";
  closeButton.setAttribute("aria-label", "Close image");
  closeButton.textContent = "×";

  const image = document.createElement("img");
  image.className = "lightbox-image";
  image.alt = "";

  const caption = document.createElement("p");
  caption.className = "lightbox-caption";

  dialog.appendChild(closeButton);
  dialog.appendChild(image);
  dialog.appendChild(caption);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let lastFocused = null;

  const openLightbox = (source) => {
    lastFocused = document.activeElement;
    image.src = source.currentSrc || source.src;
    image.alt = source.alt || "";
    caption.textContent = source.alt || "";
    caption.style.display = source.alt ? "block" : "none";
    document.body.classList.add("lightbox-open");
    overlay.classList.add("is-open");
    closeButton.focus();
  };

  const closeLightbox = () => {
    overlay.classList.remove("is-open");
    document.body.classList.remove("lightbox-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  };

  images.forEach((img) => {
    img.addEventListener("click", () => openLightbox(img));
  });

  closeButton.addEventListener("click", closeLightbox);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-open")) {
      closeLightbox();
    }
  });
})();
