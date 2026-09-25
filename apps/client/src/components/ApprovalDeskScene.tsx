import { APPROVAL_UPGRADES, type ApprovalDeskPlayer, type ApprovalUpgradeId } from "@workhard/shared";

export interface ApprovalDeskFeedback {
  id: number;
  label: string;
  kind: "stamp" | "collect" | "buy";
  upgradeId?: ApprovalUpgradeId;
}

interface ApprovalDeskSceneProps {
  levels: ApprovalDeskPlayer["levels"];
  sharedMilestones: number;
  completedProjects: number;
  working: boolean;
  ready: boolean;
  feedback?: ApprovalDeskFeedback | undefined;
}

export function ApprovalDeskScene({ levels, sharedMilestones, completedProjects, working, ready, feedback }: ApprovalDeskSceneProps) {
  const purchase = feedback?.kind === "buy" ? feedback.upgradeId : undefined;

  return <div className={`approval-desk-scene${working ? " is-working" : ""}${ready ? " is-ready" : ""}${feedback?.kind === "stamp" ? " is-stamped" : ""}${sharedMilestones >= 3 ? " is-expanded" : ""}${completedProjects > 0 ? " is-complete" : ""}`}>
    <svg className="approval-desk-art" viewBox="0 0 560 320" role="img" aria-label={sceneDescription(levels, sharedMilestones, completedProjects)}>
      <defs>
        <linearGradient id="approval-wood" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#edc88a" /><stop offset="1" stopColor="#bd8059" /></linearGradient>
        <linearGradient id="approval-paper" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fffdf4" /><stop offset="1" stopColor="#f1e4ca" /></linearGradient>
        <linearGradient id="approval-machine" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#82a1a7" /><stop offset="1" stopColor="#3d5966" /></linearGradient>
        <linearGradient id="approval-pad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#466a70" /><stop offset="1" stopColor="#28444e" /></linearGradient>
        <filter id="approval-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#253344" floodOpacity=".25" /></filter>
      </defs>

      {sharedMilestones > 0 && <g className="approval-desk-shared-art">
        <rect x="137" y="4" width="286" height="32" rx="8" fill="#315766" stroke="#d7b978" strokeWidth="3" />
        {Array.from({ length: sharedMilestones }, (_, index) => <circle key={index} cx={171 + index * 36} cy="20" r="7" fill={index === 6 ? "#f6df9c" : "#8ccdb0"} />)}
      </g>}

      <ellipse cx="280" cy="290" rx="246" ry="20" fill="#263846" opacity=".22" />
      <path d="M28 241q0 34 25 43h454q25-9 25-43v21q0 29-25 32H53q-25-3-25-32z" fill="#724c3d" />
      <rect x="28" y="42" width="504" height="244" rx="25" fill="#754f3f" />
      <rect x="28" y="31" width="504" height="244" rx="25" fill="url(#approval-wood)" stroke="#8b5d46" strokeWidth="5" />
      <rect x="46" y="49" width="468" height="209" rx="17" fill="#c79264" opacity=".42" />
      <path d="M54 69h452M54 247h452" stroke="#f2d29a" strokeWidth="3" opacity=".55" />
      <path d="M61 80c94-14 151 13 243-3s139-9 194-1M58 191c83-8 149 12 219-3s156-7 218-2M73 239c53-6 105 4 150-3" stroke="#8f654c" strokeWidth="2" opacity=".19" fill="none" />
      <path d="M69 85h45M451 83h42M67 224h40M454 222h39" stroke="#f5d5a0" strokeWidth="3" strokeLinecap="round" opacity=".6" />
      <circle cx="51" cy="54" r="3" fill="#f6dca9" /><circle cx="509" cy="54" r="3" fill="#f6dca9" /><circle cx="51" cy="251" r="3" fill="#f6dca9" /><circle cx="509" cy="251" r="3" fill="#f6dca9" />

      <rect x="185" y="49" width="198" height="212" rx="13" fill="#35515b" opacity=".38" />
      <rect x="181" y="45" width="198" height="212" rx="13" fill="url(#approval-pad)" stroke="#27434e" strokeWidth="3" />
      <path d="M194 57h172M194 246h172" stroke="#77a3a2" strokeWidth="2" opacity=".48" />

      <g className={`approval-desk-inbox-art${purchase === "inbox" ? " is-new" : ""}`} filter="url(#approval-shadow)">
        <rect x="59" y="60" width="117" height="107" rx="11" fill={levels.inbox > 0 ? "#d9a957" : "#567583"} stroke="#334e5d" strokeWidth="3" />
        {Array.from({ length: Math.max(1, Math.min(5, levels.inbox + 1)) }, (_, index) => <g key={index} transform={`translate(0 ${-index * 7})`}>
          <path d="M76 102h82l-7 38H84z" fill="url(#approval-paper)" stroke="#aa9b7c" strokeWidth="1.5" />
          <path d="M93 112h50M93 119h39" stroke="#b6b2a0" strokeWidth="2" strokeLinecap="round" />
        </g>)}
        <path d="M65 121h105v37a8 8 0 0 1-8 8H73a8 8 0 0 1-8-8z" fill={levels.inbox > 0 ? "#d9a957" : "#567583"} stroke="#334e5d" strokeWidth="3" />
        <path d="M85 141h66" stroke="#f5dca8" strokeWidth="4" strokeLinecap="round" opacity=".7" />
        {levels.inbox >= 6 && <path d="M117 62V42m-11 10h22" stroke="#f6d578" strokeWidth="5" strokeLinecap="round" />}
        <circle cx="117" cy="151" r="5" fill={levels.inbox ? "#f6d578" : "#a8bcc0"} />
      </g>

      <g className="approval-desk-form-art" filter="url(#approval-shadow)">
        <rect x="194" y="67" width="174" height="186" rx="6" transform="rotate(-5 281 160)" fill="#cfbea0" />
        <rect x="201" y="61" width="174" height="186" rx="6" transform="rotate(2 288 154)" fill="#e8dcc3" />
        <rect x="207" y="55" width="174" height="186" rx="6" fill="url(#approval-paper)" stroke="#d3c3a3" strokeWidth="2" />
        <rect x="226" y="72" width="82" height="10" rx="3" fill="#354b59" />
        <rect x="226" y="91" width="128" height="3" rx="1.5" fill="#c4c5b6" />
        <path d="M227 113h9m10 0h96M227 131h9m10 0h86M227 149h9m10 0h99" stroke="#9ba9a5" strokeWidth="3" strokeLinecap="round" />
        <path d="m228 111 3 3 6-8m-9 23 3 3 6-8" fill="none" stroke="#4e9f8f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="227" y="178" width="64" height="42" rx="3" fill="#f0e9d6" stroke="#cfc7b0" strokeWidth="2" />
        <path d="M238 189h41m-41 8h29m-29 8h35" stroke="#c4c5b6" strokeWidth="2" />
        <g className="approval-desk-ink-art" transform="rotate(-14 322 195)">
          <circle cx="322" cy="195" r={levels.stamp >= 5 ? 37 : 32} fill="none" stroke={ready ? "#4f9c82" : "#c15c4c"} strokeWidth="3" />
          <circle cx="322" cy="195" r={levels.stamp >= 5 ? 32 : 27} fill="none" stroke={ready ? "#4f9c82" : "#c15c4c"} strokeWidth="1.5" />
          <path d="m308 194 9 9 20-22" fill="none" stroke={ready ? "#4f9c82" : "#c15c4c"} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      <g className={`approval-desk-printer-art${purchase === "printer" ? " is-new" : ""}`} filter="url(#approval-shadow)">
        <rect x="404" y="81" width="110" height="104" rx="12" fill="#304351" stroke="#263a48" strokeWidth="3" />
        <path d="M419 63h80l8 46h-96z" fill={levels.printer > 0 ? "#e3ad62" : "#809ca4"} stroke="#344d5b" strokeWidth="3" />
        <path d="M427 53h63v47h-63z" fill="url(#approval-paper)" stroke="#bdbea9" strokeWidth="2" />
        <path d="M438 64h40m-40 9h40m-40 9h28" stroke="#9eaaa4" strokeWidth="2" strokeLinecap="round" />
        <path d="M404 111h110v64a10 10 0 0 1-10 10h-90a10 10 0 0 1-10-10z" fill="url(#approval-machine)" stroke="#263a48" strokeWidth="3" />
        <rect x="421" y="128" width="76" height="30" rx="5" fill="#243744" />
        <rect x="431" y="137" width="56" height="7" rx="3" fill="#dce7dc" />
        <circle cx="486" cy="117" r="5" fill={working || levels.printer ? "#7ddbb2" : "#a9bac0"} />
        {levels.printer >= 2 && <path d="M429 157h62l-5 33h-52z" fill="url(#approval-paper)" stroke="#bdbea9" strokeWidth="2" />}
        {levels.printer >= 5 && <rect x="411" y="167" width="96" height="10" rx="3" fill="#e8bc72" />}
        {Array.from({ length: levels.printer }, (_, index) => <circle key={index} cx={430 + index * 8} cy="171" r="2" fill="#f8df9b" />)}
      </g>

      <g className={`approval-desk-stamp-art${purchase === "stamp" ? " is-new" : ""}`} filter="url(#approval-shadow)">
        <ellipse cx="159" cy="220" rx="31" ry="12" fill="#405968" />
        <path d="M133 215q2-15 26-15t26 15v7h-52z" fill={levels.stamp > 0 ? "#e3ad61" : "#c96b53"} stroke="#6f493d" strokeWidth="3" />
        <path d="M151 159h16l6 42h-28z" fill={levels.stamp > 0 ? "#d9a45e" : "#a95a49"} stroke="#6f493d" strokeWidth="3" />
        <rect x="143" y="147" width="32" height="17" rx="7" fill={levels.stamp > 0 ? "#f0c77c" : "#d27a5e"} stroke="#6f493d" strokeWidth="3" />
        <circle cx="159" cy="141" r="15" fill={levels.stamp > 0 ? "#e2b976" : "#b9634d"} stroke="#6f493d" strokeWidth="3" />
        <path d="M150 137q9-8 18 0" fill="none" stroke="#fff1d5" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        {levels.stamp >= 2 && <path d="M137 209h44" stroke="#fbe4a6" strokeWidth="4" strokeLinecap="round" />}
        {levels.stamp >= 6 && <path d="m159 125 4 7-4 6-4-6z" fill="#fff2bd" />}
        {Array.from({ length: levels.stamp }, (_, index) => <circle key={index} cx={135 + index * 7} cy="217" r="2" fill="#ffe0a2" />)}
      </g>

      <g className={`approval-desk-routing-art${purchase === "routing" ? " is-new" : ""}`}>
        <path d="M60 231h63m77 0h188m22 0h89" stroke="#765b4b" strokeWidth="16" strokeLinecap="round" />
        <path d="M60 231h63m77 0h188m22 0h89" stroke={levels.routing > 0 ? "#f2c66e" : "#95c4b5"} strokeWidth="8" strokeLinecap="round" />
        {[76, 111, 220, 256, 292, 328, 364, 430, 466].slice(0, Math.max(3, levels.routing + 2)).map((x) => <circle key={x} cx={x} cy="231" r="4" fill="#fff1c8" />)}
        {levels.routing >= 3 && <path d="m480 220 15 11-15 11" fill="none" stroke="#f8e6a3" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
      </g>

      {levels.clerk > 0 && <g className={`approval-desk-clerk-art${purchase === "clerk" ? " is-new" : ""}`} filter="url(#approval-shadow)">
        <path d="M266 38q18-34 39 0l7 28h-53z" fill={levels.clerk >= 5 ? "#39546e" : "#557970"} stroke="#344955" strokeWidth="3" />
        <path d="M270 38q16-15 31 0l-4 26h-23z" fill="#f2cfab" stroke="#7d6258" strokeWidth="2" />
        <path d="M269 31q-4-28 18-28 22 0 18 29-6-12-18-12-12 0-18 11z" fill={levels.clerk >= 6 ? "#3b5463" : "#654e45"} />
        <circle cx="280" cy="39" r="2" fill="#3b4145" /><circle cx="294" cy="39" r="2" fill="#3b4145" />
        <path d="M282 49q5 4 10 0" fill="none" stroke="#a0685b" strokeWidth="2" strokeLinecap="round" />
        <path d="M263 46h-16l-12 36" fill="none" stroke="#f2cfab" strokeWidth="10" strokeLinecap="round" />
        {levels.clerk >= 3 && <path d="M273 63h27" stroke="#e9c978" strokeWidth="4" />}
        {Array.from({ length: levels.clerk }, (_, index) => <circle key={index} cx={271 + index * 5} cy="57" r="1.5" fill="#ffeba6" />)}
      </g>}

      {(working || ready) && <g className="approval-desk-case-art" filter="url(#approval-shadow)">
        <path d="M381 255h111v32H381z" fill="#fff8e8" stroke="#b8aa8e" strokeWidth="2" />
        <path d="M391 265h62m-62 8h79" stroke="#aebdb5" strokeWidth="2" />
        <circle cx="472" cy="266" r="9" fill={ready ? "#80c5a8" : "#c96b53"} />
      </g>}
      {levels.inbox > 0 && <LevelMedallion x={72} y={55} level={levels.inbox} highlighted={purchase === "inbox"} />}
      {levels.stamp > 0 && <LevelMedallion x={160} y={121} level={levels.stamp} highlighted={purchase === "stamp"} />}
      {levels.printer > 0 && <LevelMedallion x={498} y={66} level={levels.printer} highlighted={purchase === "printer"} />}
      {levels.routing > 0 && <LevelMedallion x={477} y={214} level={levels.routing} highlighted={purchase === "routing"} />}
      {levels.clerk > 0 && <LevelMedallion x={318} y={29} level={levels.clerk} highlighted={purchase === "clerk"} />}
    </svg>
  </div>;
}

function LevelMedallion({ x, y, level, highlighted }: { x: number; y: number; level: number; highlighted: boolean }) {
  return <g className={`approval-desk-level-medallion${highlighted ? " is-new" : ""}`} transform={`translate(${x} ${y})`}>
    <circle r="18" fill="#304b58" stroke="#f4d28d" strokeWidth="3" />
    <circle r="14" fill="#456876" />
    <text y="5.5" textAnchor="middle" fill="#fff7dc" fontSize="17" fontWeight="800">{level}</text>
  </g>;
}

function sceneDescription(levels: ApprovalDeskPlayer["levels"], sharedMilestones: number, completedProjects: number): string {
  const installed = APPROVAL_UPGRADES.filter((item) => levels[item.id] > 0).map((item) => `${item.name} level ${levels[item.id]}`);
  return `Stampworks desk${installed.length ? ` with ${installed.join(", ")}` : ""}; ${sharedMilestones} milestones in this project, ${completedProjects} projects complete`;
}
