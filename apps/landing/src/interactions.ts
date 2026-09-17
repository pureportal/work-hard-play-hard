for (const tour of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
  const tabs = [...tour.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (selected: HTMLButtonElement) => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")!)!.hidden = !active;
    }
  };
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", event => {
      let next: number;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next]!);
      tabs[next]!.focus();
    });
  }
}

const studio = document.querySelector<HTMLElement>(".character-studio")!;
const outfits = [...studio.querySelectorAll<HTMLButtonElement>("button[data-outfit]")];
for (const button of outfits) {
  button.addEventListener("click", () => {
    studio.dataset.outfit = button.dataset.outfit;
    for (const option of outfits) option.setAttribute("aria-pressed", String(option === button));
    for (const figure of studio.querySelectorAll<HTMLElement>("[data-character]")) {
      figure.classList.toggle("is-selected", figure.dataset.character === button.dataset.outfit);
    }
  });
}
