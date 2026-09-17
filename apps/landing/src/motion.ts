const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const motionButton = document.querySelector<HTMLButtonElement>(".motion-toggle")!;
const scene = document.querySelector<HTMLElement>("[data-parallax]")!;
let paused = false;
let frame = 0;

function updateMotion() {
  const stopped = paused || reducedMotion.matches;
  document.documentElement.dataset.motion = stopped ? "paused" : "playing";
  motionButton.hidden = reducedMotion.matches;
  motionButton.setAttribute("aria-label", stopped ? "Resume animations" : "Pause animations");
  motionButton.querySelector("use")!.setAttribute("href", stopped ? "#icon-play" : "#icon-pause");
  if (stopped) {
    cancelAnimationFrame(frame);
    scene.style.removeProperty("--scene-x");
    scene.style.removeProperty("--scene-y");
  }
}
motionButton.addEventListener("click", () => {
  paused = !paused;
  updateMotion();
});
reducedMotion.addEventListener("change", updateMotion);
updateMotion();

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.remove("is-waiting");
    observer.unobserve(entry.target);
  }
}, { threshold: .08 });
for (const element of document.querySelectorAll<HTMLElement>(".reveal")) {
  if (element.getBoundingClientRect().top > innerHeight && !reducedMotion.matches) element.classList.add("is-waiting");
  observer.observe(element);
}

scene.addEventListener("pointermove", event => {
  if (paused || reducedMotion.matches || event.pointerType !== "mouse") return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const bounds = scene.getBoundingClientRect();
    scene.style.setProperty("--scene-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 10}px`);
    scene.style.setProperty("--scene-y", `${((event.clientY - bounds.top) / bounds.height - .5) * 8}px`);
  });
});
scene.addEventListener("pointerleave", () => {
  cancelAnimationFrame(frame);
  scene.style.removeProperty("--scene-x");
  scene.style.removeProperty("--scene-y");
});
