const crops = {
  radish: { name: "Radish", plural: "Radishes", duration: 30, cost: 2, payout: 3, bonus: 0 },
  carrot: { name: "Carrot", plural: "Carrots", duration: 45, cost: 3, payout: 5, bonus: 1 },
  tomato: { name: "Tomato", plural: "Tomatoes", duration: 60, cost: 5, payout: 8, bonus: 1 },
};
const allowance = 60;
let beds;
let balance;
let minute;
let selectedBed = 0;
let selectedCrop = "radish";
let realizedProfit;

function day() {
  return Math.floor(minute / 1440);
}

function availableProfit() {
  const reserved = beds.reduce((sum, bed) => {
    if (!bed || bed.day !== day()) return sum;
    const crop = crops[bed.crop];
    return sum + crop.payout + crop.bonus - crop.cost;
  }, 0);
  return allowance - (realizedProfit.get(day()) ?? 0) - reserved;
}

function status(bed) {
  if (!bed) return "empty";
  if (bed.startedAt === null) return "dry";
  return minute >= bed.startedAt + crops[bed.crop].duration ? "ready" : "growing";
}

function canCare(bed) {
  return status(bed) === "growing" && crops[bed.crop].bonus > 0
    && !bed.cared && minute >= bed.startedAt + 30;
}

function bedText(bed) {
  const state = status(bed);
  if (state === "empty") return "Empty";
  if (state === "dry") return "Water to start";
  if (state === "ready") return "Harvest";
  return `${bed.startedAt + crops[bed.crop].duration - minute} min${bed.cared ? " · watered" : ""}`;
}

function cropArt(crop, growing = false, className = "") {
  return `<svg viewBox="30 10 100 110" class="${className}" aria-hidden="true"><use href="#${growing ? "sprout" : crop}"/></svg>`;
}

function drawBed(bed, index) {
  const state = status(bed);
  const wet = bed && (state === "growing" && (minute - bed.startedAt < 30 || bed.cared));
  const crop = bed ? `<use href="#${state !== "ready" ? "sprout" : bed.crop}"/>` : "";
  return `<button class="bed" data-bed="${index}" aria-pressed="${selectedBed === index}" aria-label="Bed ${index + 1}, ${bed ? crops[bed.crop].name : "empty"}, ${bedText(bed)}">
    <span class="bed-number">${index + 1}</span>
    <svg viewBox="0 0 160 132" aria-hidden="true">
      <ellipse cx="80" cy="112" rx="67" ry="12" fill="#638052" opacity=".12"/>
      <path d="M12 64L80 38L148 64V88L80 116L12 88Z" fill="#b38962"/>
      <path d="M80 91L148 64V88L80 116Z" fill="#a37752"/>
      <path d="M12 64L80 38L148 64L80 93Z" fill="#cfad7a"/>
      <path d="M22 64L80 44L138 64L80 85Z" fill="${wet ? "#796348" : "#967653"}"/>
      <path d="M43 58L103 78M62 50L122 71M29 69L60 56M54 78L115 57" stroke="${wet ? "#67523e" : "#846746"}" stroke-width="2" opacity=".7"/>
      ${crop}${wet ? '<use href="#drop" transform="translate(127 81)"/>' : ""}
    </svg>
    <span class="bed-name">${bed ? crops[bed.crop].name : "Plant"}</span><span class="bed-state">${bed ? bedText(bed) : ""}</span>
  </button>`;
}

function plantingReason(count) {
  const crop = crops[selectedCrop];
  if (balance < crop.cost * count) return "Not enough coins. Harvest a crop or choose a cheaper seed.";
  if (availableProfit() < (crop.payout + crop.bonus - crop.cost) * count) {
    const allowedBeds = Math.floor(availableProfit() / (crop.payout + crop.bonus - crop.cost));
    if (allowedBeds > 0) return `Plant up to ${allowedBeds} bed${allowedBeds === 1 ? "" : "s"}, or plant after 00:00 UTC.`;
    return availableProfit() > 0 ? "Choose a cheaper crop or plant after 00:00 UTC." : "Plant again after 00:00 UTC.";
  }
  return "";
}

function render() {
  const focusedButton = document.activeElement.closest("button");
  document.querySelector("#balance").textContent = balance;
  document.querySelector("#clock").textContent = `Day ${day() + 1} · ${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  document.querySelector("#beds").innerHTML = beds.map(drawBed).join("");
  const readyBeds = beds.filter(bed => status(bed) === "ready");
  const growingBeds = beds.filter(bed => status(bed) === "growing");
  const next = growingBeds.length ? Math.min(...growingBeds.map(bed => bed.startedAt + crops[bed.crop].duration - minute)) : null;
  document.querySelector("#next-harvest").textContent = readyBeds.length
    ? `${readyBeds.length} harvest${readyBeds.length === 1 ? "" : "s"} ready`
    : next !== null ? `Next harvest in ${next} min` : "";
  const emptyCount = beds.filter(bed => !bed).length;
  const wateringCount = beds.filter(bed => status(bed) === "dry" || canCare(bed)).length;
  document.querySelector("#batch-actions").innerHTML = [
    emptyCount ? `<button data-action="plant-all" ${plantingReason(emptyCount) ? "disabled" : ""}>Plant ${emptyCount} ${(emptyCount === 1 ? crops[selectedCrop].name : crops[selectedCrop].plural).toLowerCase()} · ${emptyCount * crops[selectedCrop].cost} coins</button>` : "",
    wateringCount ? '<button data-action="water-all">Water all</button>' : "",
    readyBeds.length ? `<button data-action="harvest-all">Harvest all · ${readyBeds.reduce((sum, bed) => sum + crops[bed.crop].payout + (bed.cared ? crops[bed.crop].bonus : 0), 0)} coins</button>` : "",
  ].join("");
  document.querySelector("#bed-details").innerHTML = bedDetailsMarkup(emptyCount);
  if (focusedButton?.dataset.bed !== undefined) {
    document.querySelector(`[data-bed="${focusedButton.dataset.bed}"]`).focus();
  } else if (focusedButton?.dataset.crop) {
    document.querySelector(`[data-crop="${focusedButton.dataset.crop}"]`).focus();
  } else if (focusedButton?.dataset.action) {
    const actionButton = document.querySelector(`[data-action="${focusedButton.dataset.action}"]`);
    if (actionButton && !actionButton.disabled) actionButton.focus();
    else document.querySelector(`#beds [data-bed="${selectedBed}"]`).focus();
  }
}

function bedDetailsMarkup(emptyCount) {
  const bed = beds[selectedBed];
  if (!bed) {
    const crop = crops[selectedCrop];
    const reason = plantingReason(1);
    const batchReason = emptyCount > 1 ? plantingReason(emptyCount) : "";
    return `<h2>Bed ${selectedBed + 1}</h2>
      <div class="seed-picker">${Object.entries(crops).map(([id, seed]) => `<button class="seed" data-crop="${id}" aria-pressed="${selectedCrop === id}">
        ${cropArt(id)}
        <span class="seed-info"><span class="seed-name">${seed.name}</span><span class="seed-time">${seed.duration} min</span></span>
        <span class="seed-price">${seed.cost} coins</span>
      </button>`).join("")}</div>
      <div class="crop-facts"><span>Harvest</span><span>${crop.payout}${crop.bonus ? `–${crop.payout + crop.bonus}` : ""} coins</span></div>
      <button class="primary" data-action="plant" ${reason ? "disabled" : ""}>Plant · ${crop.cost} coins</button>
      ${reason || batchReason ? `<p class="unavailable">${reason || batchReason}</p>` : ""}`;
  }
  const crop = crops[bed.crop];
  const state = status(bed);
  const progress = bed.startedAt === null ? 0 : Math.min(100, (minute - bed.startedAt) / crop.duration * 100);
  const careWait = bed.startedAt === null ? 30 : Math.max(0, bed.startedAt + 30 - minute);
  return `<h2>Bed ${selectedBed + 1}</h2>
    ${cropArt(bed.crop, state !== "ready", "selected-crop")}
    <p class="crop-name">${crop.name}</p>
    ${state !== "ready" ? `<div class="crop-facts"><span>Growth</span><span>${bedText(bed)}</span></div>` : ""}
    <div class="crop-facts"><span>Harvest</span><span>${crop.payout + (bed.cared ? crop.bonus : 0)} coins</span></div>
    ${state === "growing" ? `<div class="progress" aria-hidden="true"><span style="width:${progress}%"></span></div>` : ""}
    ${state === "dry" ? '<button class="primary" data-action="water">Water</button>'
      : state === "ready" ? `<button class="primary" data-action="harvest">Harvest · ${crop.payout + (bed.cared ? crop.bonus : 0)} coins</button>`
      : crop.bonus && !bed.cared ? `<div class="care"><button data-action="water" ${canCare(bed) ? "" : "disabled"}>${canCare(bed) ? "Water · +1 coin" : `Water in ${careWait} min`}</button></div>` : ""}`;
}

function perform(action, indexes) {
  if (action === "plant") {
    const reason = plantingReason(indexes.length);
    if (reason || indexes.some(index => beds[index])) return;
    balance -= crops[selectedCrop].cost * indexes.length;
    for (const index of indexes) beds[index] = { crop: selectedCrop, startedAt: null, cared: false, day: day() };
  } else if (action === "water") {
    for (const index of indexes) {
      const bed = beds[index];
      if (status(bed) === "dry") bed.startedAt = minute;
      else if (canCare(bed)) bed.cared = true;
    }
  } else if (action === "harvest") {
    let collected = 0;
    for (const index of indexes) {
      const bed = beds[index];
      if (status(bed) !== "ready") continue;
      const crop = crops[bed.crop];
      const payout = crop.payout + (bed.cared ? crop.bonus : 0);
      balance += payout;
      collected += payout;
      realizedProfit.set(bed.day, (realizedProfit.get(bed.day) ?? 0) + payout - crop.cost);
      beds[index] = null;
    }
    document.querySelector("#feedback").textContent = `Collected ${collected} coins.`;
  }
  render();
}

function reset(example) {
  beds = Array(6).fill(null);
  balance = 250;
  minute = 540;
  selectedBed = 0;
  selectedCrop = "radish";
  realizedProfit = new Map();
  if (example) {
    beds[0] = { crop: "radish", startedAt: 540, cared: false, day: 0 };
    beds[1] = { crop: "carrot", startedAt: 540, cared: false, day: 0 };
    beds[2] = { crop: "tomato", startedAt: 540, cared: false, day: 0 };
    balance = 240;
    minute = 570;
  }
  document.querySelector("#feedback").textContent = "";
  render();
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  document.querySelector("#feedback").textContent = "";
  if (button.dataset.bed !== undefined) selectedBed = Number(button.dataset.bed);
  else if (button.dataset.crop) selectedCrop = button.dataset.crop;
  else if (button.dataset.advance) minute += Number(button.dataset.advance);
  else if (button.id === "example" || button.id === "reset") return reset(button.id === "example");
  else if (button.dataset.action) {
    const action = button.dataset.action;
    return perform(action.replace("-all", ""), action.endsWith("-all")
      ? beds.map((_, index) => index).filter(index => action === "plant-all" ? !beds[index] : true)
      : [selectedBed]);
  }
  render();
});

reset(true);
